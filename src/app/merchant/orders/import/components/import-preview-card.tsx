"use client"

import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ResolvedRow } from "@/features/orders/bulk-import/resolve-rows"
import { quoteParcel } from "@/features/orders/quote-parcel"
import type { DeliveryCityOption } from "@/features/platform-config/hooks/use-delivery-cities"
import type { PlatformPricingDefaults } from "@/features/platform-config/hooks/use-platform-pricing-public"
import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import type { PickupLocation } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ParcelCard } from "../../new/components/parcel-card"
import type { ParcelRow, ParcelState } from "../../new/types"
import { resolvedRowToParcelState } from "../row-to-parcel"
import type { ImportPhase } from "../types"

interface ImportPreviewCardProps {
  phase: ImportPhase
  rows: ResolvedRow[]
  serverErrors: Record<number, string[]>
  validCount: number
  errorCount: number
  errorsOnly: boolean
  emptyMessage?: string
  showConfirm: boolean
  confirmDisabled: boolean
  myLocations: PickupLocation[]
  deliveryCities: DeliveryCityOption[]
  zonePricing: ZonePricingEstimate[]
  platformDefaults: PlatformPricingDefaults | null
  maxWeightKg: number
  onParcelChange: (line: number, key: keyof ParcelState, value: string) => void
  onRemoveRow: (line: number) => void
  onErrorsOnlyChange: (value: boolean) => void
  onErrorCsvDownload: () => void
  onJumpToError: () => void
  onConfirm: () => void
  onCancel: () => void
}

const FILTER_BUTTON =
  "h-7 rounded-md px-2.5 text-xs font-medium hover:bg-transparent"

function filterButtonClass(active: boolean): string {
  return cn(
    FILTER_BUTTON,
    active
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  )
}

export function ImportPreviewCard({
  phase,
  rows,
  serverErrors,
  validCount,
  errorCount,
  errorsOnly,
  emptyMessage,
  showConfirm,
  confirmDisabled,
  myLocations,
  deliveryCities,
  zonePricing,
  platformDefaults,
  maxWeightKg,
  onParcelChange,
  onRemoveRow,
  onErrorsOnlyChange,
  onErrorCsvDownload,
  onJumpToError,
  onConfirm,
  onCancel,
}: ImportPreviewCardProps) {
  const summaryReason =
    errorCount > 0
      ? `Fix ${errorCount} error${errorCount === 1 ? "" : "s"} to enable import`
      : `Ready to import ${validCount} order${validCount === 1 ? "" : "s"}`

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          Edit any row in place — validation and the counts update as you type.
        </CardDescription>
        <CardAction>
          <p data-testid="bulk-import-summary" className="text-sm font-medium">
            <span className="text-green-600 dark:text-green-400">
              {validCount} valid
            </span>
            <span className="text-muted-foreground">{" · "}</span>
            <span
              className={
                errorCount > 0 ? "text-destructive" : "text-muted-foreground"
              }
            >
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          </p>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <fieldset className="m-0 flex w-fit items-center gap-1 rounded-lg border-0 bg-muted p-1">
            <legend className="sr-only">Filter preview rows</legend>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="bulk-import-filter-all"
              aria-pressed={!errorsOnly}
              className={filterButtonClass(!errorsOnly)}
              onClick={() => onErrorsOnlyChange(false)}
            >
              All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="bulk-import-filter-errors"
              aria-pressed={errorsOnly}
              className={filterButtonClass(errorsOnly)}
              onClick={() => onErrorsOnlyChange(true)}
            >
              Errors only
            </Button>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            {errorCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="bulk-import-jump-error"
                onClick={onJumpToError}
              >
                Jump to first error
              </Button>
            ) : null}
            {errorCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="bulk-import-error-export"
                onClick={onErrorCsvDownload}
              >
                <Download className="size-4" />
                Download error CSV
              </Button>
            ) : null}
          </div>
        </div>

        <div data-testid="bulk-import-preview" className="flex flex-col gap-4">
          {rows.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border px-4 py-10 text-center text-sm">
              {emptyMessage ?? "No rows to preview."}
            </p>
          ) : (
            rows.map((row, index) => {
              const parcel = resolvedRowToParcelState(
                row,
                myLocations,
                deliveryCities,
              )
              const quote = quoteParcel({
                pickupLocationId: parcel.pickupLocationId,
                deliveryCityId: parcel.deliveryCityId,
                parcelWeightKg: parcel.parcelWeightKg,
                productCost: parcel.productCost,
                pickupLocations: myLocations,
                deliveryCities,
                zonePricing,
                platformDefaults,
                maxWeightKg,
              })
              const parcelRow: ParcelRow = {
                parcel,
                ...quote,
                errors: [...row.errors, ...(serverErrors[row.line] ?? [])],
              }
              return (
                <div key={row.line} data-testid={`bulk-import-row-${row.line}`}>
                  <ParcelCard
                    row={parcelRow}
                    index={index}
                    parcelCount={rows.length}
                    maxWeightKg={maxWeightKg}
                    deliveryCities={deliveryCities}
                    myLocations={myLocations}
                    updateParcel={(_id, key, value) =>
                      onParcelChange(row.line, key, value)
                    }
                    removeParcel={() => onRemoveRow(row.line)}
                  />
                </div>
              )
            })
          )}
        </div>
      </CardContent>
      <CardFooter className="sticky bottom-0 z-10 bg-background">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">{summaryReason}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="bulk-import-cancel"
              disabled={phase === "submitting"}
              onClick={onCancel}
            >
              Cancel
            </Button>
            {showConfirm ? (
              <Button
                type="button"
                data-testid="bulk-import-confirm"
                disabled={confirmDisabled}
                onClick={onConfirm}
              >
                {phase === "submitting" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Import {validCount} order{validCount === 1 ? "" : "s"}
              </Button>
            ) : null}
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
