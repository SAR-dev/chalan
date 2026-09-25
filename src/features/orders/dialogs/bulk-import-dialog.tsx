"use client"

import { Download, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  type ImportParseResult,
  parseImportFile,
  parseImportText,
} from "@/features/orders/bulk-import/csv-parse"
import {
  type ResolvedRow,
  type ResolveLookups,
  resolveRows,
} from "@/features/orders/bulk-import/resolve-rows"
import {
  buildErrorCsv,
  buildTemplateCsv,
} from "@/features/orders/bulk-import/template"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { MAX_BULK_ORDERS } from "@/lib/constants"
import { downloadCsv } from "@/lib/csv"
import { formatError } from "@/lib/validation"

type ImportPhase =
  | "idle"
  | "parsing"
  | "preview"
  | "submitting"
  | "done"
  | "error"

type InputSource = "file" | "paste"

const NETWORK_ERROR =
  "We couldn't confirm the import. Check your orders list before retrying."

const LOADING_MERCHANT =
  "Still loading your merchant data. Try again in a moment."

const PASTE_DEBOUNCE_MS = 400

export function BulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { currentMerchant } = useMerchants()
  const { pickupLocations } = usePickupLocations()
  const { cities } = useDeliveryCities()
  const { createOrders } = useOrders()

  const [phase, setPhase] = useState<ImportPhase>("idle")
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ResolvedRow[]>([])
  const [source, setSource] = useState<InputSource | null>(null)
  const [pasteText, setPasteText] = useState("")
  const [banner, setBanner] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({})
  const submittingRef = useRef(false)
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current)
    }
  }, [])

  const myLocations = currentMerchant
    ? pickupLocations.filter((p) => p.merchantId === currentMerchant.id)
    : []
  const maxWeightKg = currentMerchant?.maxWeightKg
  const lookups: ResolveLookups | null =
    currentMerchant && maxWeightKg
      ? {
          pickupLocations: myLocations.map((p) => ({
            id: p.id,
            name: p.label,
          })),
          deliveryCities: cities.map((c) => ({ id: c.id, name: c.name })),
          maxWeightKg,
        }
      : null
  const canImport = myLocations.length > 0
  const isPreview =
    phase === "preview" || phase === "submitting" || phase === "error"

  const validCount = rows.filter((row) => row.errors.length === 0).length
  const errorCount = rows.filter(
    (row) => row.errors.length > 0 || (serverErrors[row.line]?.length ?? 0) > 0,
  ).length
  const hasServerErrors = Object.keys(serverErrors).length > 0
  const summary = `${validCount} valid · ${errorCount} ${errorCount === 1 ? "error" : "errors"}`
  const confirmDisabled =
    phase === "submitting" || errorCount > 0 || validCount === 0
  const showConfirm =
    phase === "preview" ||
    phase === "submitting" ||
    (phase === "error" && !hasServerErrors)

  function reset() {
    setPhase("idle")
    setParseError(null)
    setRows([])
    setSource(null)
    setPasteText("")
    setBanner(null)
    setServerErrors({})
    if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function applyResult(result: ImportParseResult, from: InputSource) {
    if (!result.ok) {
      setRows([])
      setSource(null)
      setServerErrors({})
      setBanner(null)
      setParseError(result.error)
      setPhase("idle")
      return
    }
    if (!lookups) {
      setParseError(LOADING_MERCHANT)
      setPhase("idle")
      return
    }
    setParseError(null)
    setServerErrors({})
    setBanner(null)
    setRows(resolveRows(result.rows, lookups))
    setSource(from)
    setPhase("preview")
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.target
    const file = element.files?.[0]
    element.value = ""
    if (!file) return
    setPhase("parsing")
    setParseError(null)
    try {
      const buffer = await file.arrayBuffer()
      applyResult(
        parseImportFile({ name: file.name, size: file.size, buffer }),
        "file",
      )
    } catch {
      applyResult(
        {
          ok: false,
          error:
            "Could not read this file. Re-save it as CSV UTF-8 and try again.",
        },
        "file",
      )
    }
  }

  function handlePasteChange(value: string) {
    setPasteText(value)
    if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current)
    pasteTimerRef.current = setTimeout(() => {
      pasteTimerRef.current = null
      if (submittingRef.current) return
      if (!value.trim()) {
        if (source === "paste") {
          setRows([])
          setSource(null)
          setServerErrors({})
          setBanner(null)
          setParseError(null)
          setPhase("idle")
        }
        return
      }
      setPhase("parsing")
      setParseError(null)
      applyResult(parseImportText(value), "paste")
    }, PASTE_DEBOUNCE_MS)
  }

  function handleTemplateDownload() {
    downloadCsv(
      "order-import-template",
      buildTemplateCsv({
        pickupLocation: myLocations[0]?.label,
        deliveryCity: cities[0]?.name,
      }),
    )
  }

  function handleErrorCsvDownload() {
    const errorRows = rows
      .filter(
        (row) =>
          row.errors.length > 0 || (serverErrors[row.line]?.length ?? 0) > 0,
      )
      .map((row) => ({
        values: row.raw,
        error: [...row.errors, ...(serverErrors[row.line] ?? [])].join(" "),
      }))
    downloadCsv("order-import-errors", buildErrorCsv(errorRows))
  }

  async function handleConfirm() {
    if (submittingRef.current) return
    const valid = rows.filter((row) => row.errors.length === 0)
    if (valid.length === 0) return
    submittingRef.current = true
    setPhase("submitting")
    setBanner(null)
    try {
      const result = await createOrders(valid.map((row) => row.input))
      if (result.ok) {
        const count = result.orders?.length ?? valid.length
        setPhase("done")
        toast.success(`${count} order${count === 1 ? "" : "s"} created`)
        handleOpenChange(false)
        return
      }
      const mapped: Record<number, string[]> = {}
      const addError = (line: number, message: string) => {
        mapped[line] = [...(mapped[line] ?? []), message]
      }
      const grouped = new Map<
        number,
        Array<{ path: (string | number)[]; message: string }>
      >()
      for (const issue of result.issues ?? []) {
        if (issue.path[0] === "orders" && typeof issue.path[1] === "number") {
          const index = issue.path[1]
          grouped.set(index, [...(grouped.get(index) ?? []), issue])
        }
      }
      for (const [index, issues] of grouped) {
        const target = valid[index]
        if (target) addError(target.line, formatError({ issues }))
      }
      for (const index of result.rows ?? []) {
        const target = valid[index]
        if (target) {
          addError(target.line, result.error ?? "Rejected by the server.")
        }
      }
      if (Object.keys(mapped).length > 0) setServerErrors(mapped)
      const message = result.error ?? "The import was rejected."
      setBanner(message)
      setPhase("error")
      toast.error(message)
    } catch {
      setBanner(NETWORK_ERROR)
      setPhase("error")
      toast.error(NETWORK_ERROR)
    } finally {
      submittingRef.current = false
    }
  }

  const footer = (
    <DialogFooter>
      {isPreview && errorCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          data-testid="bulk-import-error-export"
          onClick={handleErrorCsvDownload}
        >
          <Download className="size-4" />
          Download error CSV
        </Button>
      ) : null}
      {showConfirm ? (
        <Button
          type="button"
          data-testid="bulk-import-confirm"
          disabled={confirmDisabled}
          onClick={handleConfirm}
        >
          {phase === "submitting" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Import {validCount} order{validCount === 1 ? "" : "s"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={phase === "submitting"}
        onClick={() => handleOpenChange(false)}
      >
        Cancel
      </Button>
    </DialogFooter>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Import orders from CSV"
      description="Download the template, fill in one row per order, then preview every row. Nothing is created until the whole file is error-free."
      size="lg"
      footer={footer}
    >
      {phase === "parsing" ? (
        <div
          data-testid="bulk-import-loading"
          className="text-muted-foreground flex items-center justify-center gap-2 py-10"
        >
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">Parsing rows…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {isPreview ? (
            <div className="flex flex-col gap-3">
              <p
                data-testid="bulk-import-summary"
                className="text-sm font-medium"
              >
                {summary}
              </p>
              {banner ? (
                <p
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
                >
                  {banner}
                </p>
              ) : null}
              <div
                data-testid="bulk-import-preview"
                className="overflow-x-auto rounded-lg border"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const rowErrors = [
                        ...row.errors,
                        ...(serverErrors[row.line] ?? []),
                      ]
                      return (
                        <TableRow
                          key={row.line}
                          data-testid={`bulk-import-row-${row.line}`}
                        >
                          <TableCell className="font-mono text-xs">
                            {row.line}
                          </TableCell>
                          <TableCell>{row.raw.recipient_name}</TableCell>
                          <TableCell>{row.raw.delivery_city}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.raw.parcel_weight_kg}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.raw.product_cost}
                          </TableCell>
                          <TableCell
                            className={
                              rowErrors.length > 0
                                ? "text-destructive text-xs"
                                : "text-muted-foreground text-xs"
                            }
                          >
                            {rowErrors.length > 0 ? rowErrors.join(" ") : "OK"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {phase === "idle" && parseError ? (
            <p role="alert" className="text-destructive text-sm">
              {parseError}
            </p>
          ) : null}

          {!canImport ? (
            <div className="border-border flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium">Add a pickup location first</p>
              <p className="text-muted-foreground text-sm">
                Every imported order needs a pickup location for your shop.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                render={<Link href="/merchant/settings" />}
                nativeButton={false}
              >
                Add pickup location
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="bulk-import-file">CSV file</Label>
            <Input
              id="bulk-import-file"
              data-testid="bulk-import-file"
              type="file"
              accept=".csv,text/csv"
              disabled={!canImport}
              onChange={handleFileChange}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bulk-import-paste">
              Paste rows from Excel/Google Sheets
            </Label>
            <Textarea
              id="bulk-import-paste"
              data-testid="bulk-import-paste"
              value={pasteText}
              onChange={(event) => handlePasteChange(event.target.value)}
              disabled={!canImport}
              rows={4}
              placeholder="Paste the header row plus your data rows (tab or comma separated)…"
            />
            {isPreview ? (
              <p className="text-muted-foreground text-xs">
                Fix a row below, paste the corrected rows, or re-upload the
                saved file.
              </p>
            ) : null}
          </div>

          {phase === "idle" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="bulk-import-template"
                  onClick={handleTemplateDownload}
                >
                  <Download className="size-4" />
                  Download template
                </Button>
                <p className="text-muted-foreground text-xs">
                  Up to {MAX_BULK_ORDERS} rows · 2 MB · UTF-8 CSV only
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Pickup locations
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {myLocations.map((location) => (
                      <li key={location.id} className="truncate">
                        {location.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    Delivery cities
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {cities.map((city) => (
                      <li key={city.id} className="truncate">
                        {city.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </FormDialog>
  )
}
