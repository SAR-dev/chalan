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
} from "@/features/orders/bulk-import/template"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { downloadCsv } from "@/lib/csv"
import { formatError } from "@/lib/validation"
import type { ParcelState } from "../new/types"
import { buildImportParcelRows } from "./build-parcel-rows"
import { ImportInputCard } from "./components/import-input-card"
import { ImportPreviewCard } from "./components/import-preview-card"
import { parcelStateToRawPatch } from "./row-to-parcel"
import type { ImportPhase } from "./types"

const NETWORK_ERROR =
  "We couldn't confirm the import. Check your orders list before retrying."

const LOADING_MERCHANT =
  "Still loading your merchant data. Try again in a moment."

const EMPTY_FILTER_MESSAGE = "No errors — all rows are valid."

interface ImportClientProps {
  phase: ImportPhase
  setPhase: (phase: ImportPhase) => void
}

export function ImportClient({ phase, setPhase }: ImportClientProps) {
  const router = useRouter()
  const { currentMerchant } = useMerchants()
  const { pickupLocations } = usePickupLocations()
  const { cities } = useDeliveryCities()
  const { pricing: zonePricing } = useZonePricingPublic()
  // Only used to name the zone pair in the "cannot be priced" message.
  const { zones } = useDeliveryZones()
  const { createOrders } = useOrders()

  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ResolvedRow[]>([])
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({})
  const submittingRef = useRef(false)

  const myLocations = currentMerchant
    ? pickupLocations.filter((p) => p.merchantId === currentMerchant.id)
    : []
  const lookups: ResolveLookups | null = useMemo(() => {
    if (!currentMerchant) return null
    return {
      pickupLocations: pickupLocations
        .filter((p) => p.merchantId === currentMerchant.id)
        .map((p) => ({ id: p.id, name: p.label })),
      deliveryCities: cities.map((c) => ({ id: c.id, name: c.name })),
    }
  }, [currentMerchant, pickupLocations, cities])

  // A file can resolve before the lookups finish loading (e.g. the cities
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

  // Quoted once and shared with the preview card, so "can this batch be
  // submitted?" and "what does each row look like?" are the same computation.
  const parcelRows = useMemo(
    () =>
      currentMerchant
        ? buildImportParcelRows(rows, {
            myLocations,
            deliveryCities: cities,
            zonePricing,
            zones,
            serverErrors,
          })
        : [],
    [
      rows,
      currentMerchant,
      myLocations,
      cities,
      zonePricing,
      zones,
      serverErrors,
    ],
  )

  /**
   * Every blocking message for a row: CSV validation, errors from a previous
   * submit, "no rate configured for this lane", and the route's own weight
   * limit (which is lane-dependent rather than a CSV rule, so it is only known
   * once both endpoints resolve). Single-sourced so the counts, the errors-only
   * filter, the jump link and the error CSV all agree on a row's problem.
   */
  const messagesFor = (row: ResolvedRow): string[] => {
    const messages = [...row.errors, ...(serverErrors[row.line] ?? [])]
    const quoted = parcelRows.find((p) => p.line === row.line)?.row
    if (quoted?.pricingError) messages.push(quoted.pricingError)
    if (quoted?.exceedsMax) {
      messages.push(`Parcel weight exceeds the ${quoted.maxWeightKg} KG limit.`)
    }
    return messages
  }

  const errorLines = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => messagesFor(row).length > 0)
          .map((row) => row.line),
      ),
    [rows, serverErrors, parcelRows],
  )

  const validCount = rows.length - errorLines.size
  const errorCount = errorLines.size
  const visibleParcelRows = errorsOnly
    ? parcelRows.filter((p) => errorLines.has(p.line))
    : parcelRows
  const hasServerErrors = Object.keys(serverErrors).length > 0
  const confirmDisabled =
    phase === "submitting" || errorCount > 0 || validCount === 0
  const showConfirm =
    phase === "preview" ||
    phase === "submitting" ||
    (phase === "error" && !hasServerErrors)
  const alertMessage = phase === "idle" ? parseError : banner
  const emptyMessage = errorsOnly ? EMPTY_FILTER_MESSAGE : undefined

  function resetPreview() {
    setRows([])
    setSourceFileName(null)
    setServerErrors({})
    setBanner(null)
    setErrorsOnly(false)
  }

  function applyResult(result: ImportParseResult) {
    if (!result.ok) {
      resetPreview()
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
    setErrorsOnly(false)
    setPhase("preview")
  }

  async function processFile(file: File) {
    setSourceFileName(file.name)
    setPhase("parsing")
    setParseError(null)
    try {
      const buffer = await file.arrayBuffer()
      applyResult(parseImportFile({ name: file.name, size: file.size, buffer }))
    } catch {
      applyResult({
        ok: false,
        error:
          "Could not read this file. Re-save it as CSV UTF-8 and try again.",
      })
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const element = event.target
    const file = element.files?.[0]
    element.value = ""
    if (!file) return
    void processFile(file)
  }

  function handleFileDrop(file: File) {
    void processFile(file)
  }

  function handleParcelChange(
    line: number,
    key: keyof ParcelState,
    value: string,
  ) {
    if (!lookups) return
    setRows((prev) =>
      prev.map((row) =>
        row.line === line
          ? resolveRow(
              {
                __line: row.line,
                values: {
                  ...row.raw,
                  ...parcelStateToRawPatch(
                    key,
                    value,
                    row.raw,
                    myLocations,
                    cities,
                  ),
                },
              },
              lookups,
            )
          : row,
      ),
    )
  }

  function handleRemoveRow(line: number) {
    setRows((prev) => prev.filter((row) => row.line !== line))
  }

  function handleJumpToError() {
    const target = rows.find((row) => messagesFor(row).length > 0)
    if (!target) return
    document
      .querySelector(`[data-testid="bulk-import-row-${target.line}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" })
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
      .filter((row) => messagesFor(row).length > 0)
      .map((row) => ({
        values: row.raw,
        error: messagesFor(row).join(" "),
      }))
    downloadCsv("order-import-errors", buildErrorCsv(errorRows))
  }

  function handleCancel() {
    router.back()
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
        myLocations={myLocations}
        cities={cities}
        sourceFileName={sourceFileName}
        sourceRowCount={rows.length}
        onFileChange={handleFileChange}
        onFileDrop={handleFileDrop}
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
          parcelRows={visibleParcelRows}
          validCount={validCount}
          errorCount={errorCount}
          errorsOnly={errorsOnly}
          emptyMessage={emptyMessage}
          showConfirm={showConfirm}
          confirmDisabled={confirmDisabled}
          myLocations={myLocations}
          deliveryCities={cities}
          onParcelChange={handleParcelChange}
          onRemoveRow={handleRemoveRow}
          onErrorsOnlyChange={setErrorsOnly}
          onErrorCsvDownload={handleErrorCsvDownload}
          onJumpToError={handleJumpToError}
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
