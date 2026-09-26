"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  type ImportParseResult,
  parseImportFile,
  parseImportText,
} from "@/features/orders/bulk-import/csv-parse"
import {
  type ResolvedRow,
  type ResolveLookups,
  resolveRow,
  resolveRows,
} from "@/features/orders/bulk-import/resolve-rows"
import {
  buildErrorCsv,
  buildTemplateCsv,
  type OrderImportHeader,
} from "@/features/orders/bulk-import/template"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { downloadCsv } from "@/lib/csv"
import { formatError } from "@/lib/validation"
import { ImportInputCard } from "./components/import-input-card"
import { ImportPreviewCard } from "./components/import-preview-card"
import type { ImportPhase, InputSource } from "./types"

const NETWORK_ERROR =
  "We couldn't confirm the import. Check your orders list before retrying."

const LOADING_MERCHANT =
  "Still loading your merchant data. Try again in a moment."

const PASTE_DEBOUNCE_MS = 400

export function ImportClient() {
  const router = useRouter()
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
  const lookups: ResolveLookups | null = useMemo(() => {
    if (!currentMerchant || !maxWeightKg) return null
    return {
      pickupLocations: pickupLocations
        .filter((p) => p.merchantId === currentMerchant.id)
        .map((p) => ({ id: p.id, name: p.label })),
      deliveryCities: cities.map((c) => ({ id: c.id, name: c.name })),
      maxWeightKg,
    }
  }, [currentMerchant, pickupLocations, cities, maxWeightKg])

  // A paste can resolve before the lookups finish loading (e.g. the cities
  // fetch on first visit), which would strand rows with stale "unknown city"
  // errors. Re-resolve every parsed row whenever the lookups change.
  useEffect(() => {
    if (!lookups) return
    setRows((prev) => {
      if (prev.length === 0) return prev
      const next = prev.map((row) =>
        resolveRow({ __line: row.line, values: row.raw }, lookups),
      )
      const changed = next.some(
        (row, i) => JSON.stringify(row) !== JSON.stringify(prev[i]),
      )
      return changed ? next : prev
    })
  }, [lookups, rows])
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
  const alertMessage = phase === "idle" ? parseError : banner

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

  function handleCellChange(
    line: number,
    field: OrderImportHeader,
    value: string,
  ) {
    if (!lookups) return
    setRows((prev) =>
      prev.map((row) =>
        row.line === line
          ? resolveRow(
              { __line: row.line, values: { ...row.raw, [field]: value } },
              lookups,
            )
          : row,
      ),
    )
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

  function handleCancel() {
    router.push("/merchant/orders")
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
        router.push("/merchant/orders")
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

  return (
    <div className="flex flex-col gap-6">
      <ImportInputCard
        phase={phase}
        canImport={canImport}
        pasteText={pasteText}
        myLocations={myLocations}
        cities={cities}
        onFileChange={handleFileChange}
        onPasteChange={handlePasteChange}
        onTemplateDownload={handleTemplateDownload}
      />

      {phase === "parsing" ? (
        <Card>
          <CardContent
            data-testid="bulk-import-loading"
            className="text-muted-foreground flex items-center justify-center gap-2 py-10"
          >
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Parsing rows…</span>
          </CardContent>
        </Card>
      ) : isPreview && lookups ? (
        <ImportPreviewCard
          phase={phase}
          rows={rows}
          serverErrors={serverErrors}
          summary={summary}
          validCount={validCount}
          errorCount={errorCount}
          showConfirm={showConfirm}
          confirmDisabled={confirmDisabled}
          lookups={lookups}
          onCellChange={handleCellChange}
          onErrorCsvDownload={handleErrorCsvDownload}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : null}

      {alertMessage ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
        >
          {alertMessage}
        </div>
      ) : null}
    </div>
  )
}
