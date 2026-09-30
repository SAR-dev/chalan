"use client"

import { useMemo, useState } from "react"
import { formatTk } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import type { ZonePricingEstimate } from "../hooks/use-zone-pricing-public"

/**
 * Zones × zones price matrix for a merchant.
 *
 * The underlying data is a list of ordered (fromZone → toZone) rates, which is
 * how the pricing is stored and how it is charged. A matrix is how a merchant
 * reads it: one glance answers "what does it cost from X to anywhere", which a
 * flat list cannot.
 *
 * Two properties this component has to make explicit rather than imply:
 *
 * 1. **It is directional.** X→Y and Y→X are separate cells with separate
 *    prices, so the axes are labelled "Pickup zone" and "Delivery zone" instead
 *    of relying on a reader assuming symmetry.
 * 2. **A blank cell means "not configured", not "free".** An unpriced lane
 *    cannot be ordered on at all, so it renders an em dash with an accessible
 *    label rather than `0 TK`.
 */

interface ZoneMatrixProps {
  /** Active zones, for names. An id missing here falls back to its raw value. */
  zones: ReadonlyArray<{ id: string; name: string }>
  rates: ReadonlyArray<ZonePricingEstimate>
}

type Lane = { fromZoneId: string; toZoneId: string } | null

export function ZoneRateMatrix({ zones, rates }: ZoneMatrixProps) {
  const [selected, setSelected] = useState<Lane>(null)

  const zoneNameById = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones],
  )
  const nameOf = (id: string) => zoneNameById.get(id) ?? id

  // Rows are origins, columns are destinations. Both sets come from the rates
  // themselves (the union of each side), so every row and column shown has at
  // least one configured lane — a zone with no rates at all is not a gap in the
  // matrix, it is a gap the admin-facing coverage checklist reports.
  const rowZoneIds = useMemo(
    () =>
      [...new Set(rates.map((r) => r.fromZoneId))].sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b)),
      ),
    // `nameOf` closes over `zoneNameById`; listing it keeps the memo honest.
    [rates, zoneNameById],
  )
  const colZoneIds = useMemo(
    () =>
      [...new Set(rates.map((r) => r.toZoneId))].sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b)),
      ),
    [rates, zoneNameById],
  )

  const findRate = (fromZoneId: string, toZoneId: string) =>
    rates.find((r) => r.fromZoneId === fromZoneId && r.toZoneId === toZoneId) ??
    null

  const selectedRate = selected
    ? findRate(selected.fromZoneId, selected.toZoneId)
    : null

  if (rates.length === 0) {
    return (
      <p
        className="text-muted-foreground rounded-lg border px-4 py-10 text-center text-sm"
        data-testid="zone-rate-matrix-empty"
      >
        No route rates have been configured yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        className="overflow-x-auto"
        data-testid="zone-rate-matrix"
        aria-label="Delivery rates by pickup and delivery zone"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            {/* Two header rows: the first names the column axis, the second
                names the row axis and carries the columns themselves. Without
                this the columns are just zone names with nothing saying what
                they mean. */}
            <tr>
              {/* Empty corner cell: row 1 spans the column axis, row 2 labels
                  the row axis and repeats the columns beneath it. */}
              <th
                scope="col"
                className="bg-muted/50 sticky left-0 z-10 border-border border-b border-r"
              />
              <th
                scope="col"
                colSpan={colZoneIds.length}
                className="border-border border-b px-3 py-1.5 text-center text-[11px] font-medium tracking-wide uppercase"
              >
                Delivery zone
              </th>
            </tr>
            <tr>
              <th
                scope="col"
                className="bg-muted/50 sticky left-0 z-10 border-border border-b border-r px-4 py-2 text-left font-medium"
              >
                Pickup zone
              </th>
              {colZoneIds.map((toZoneId) => (
                <th
                  key={toZoneId}
                  scope="col"
                  className="border-border border-b px-3 py-2 text-right font-medium"
                >
                  {nameOf(toZoneId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowZoneIds.map((fromZoneId) => (
              <tr key={fromZoneId} className="border-border border-t">
                <th
                  scope="row"
                  className="bg-background sticky left-0 z-10 border-border border-r px-4 py-2 text-left font-medium"
                >
                  {nameOf(fromZoneId)}
                </th>
                {colZoneIds.map((toZoneId) => {
                  const rate = findRate(fromZoneId, toZoneId)
                  const isSelected =
                    selected?.fromZoneId === fromZoneId &&
                    selected?.toZoneId === toZoneId
                  return (
                    <td
                      key={toZoneId}
                      className="px-0 py-0 text-right tabular-nums"
                    >
                      <button
                        type="button"
                        data-testid="zone-matrix-cell"
                        data-lane={`${fromZoneId}:${toZoneId}`}
                        data-priced={rate ? "true" : "false"}
                        aria-pressed={isSelected}
                        // The row/column headers carry the axes for a table
                        // reader, but each cell also names its own route, price
                        // and — crucially — whether it is configured at all.
                        aria-label={`${nameOf(fromZoneId)} to ${nameOf(toZoneId)}: ${
                          rate ? formatTk(rate.baseRate) : "not configured"
                        }`}
                        onClick={() =>
                          setSelected(
                            isSelected ? null : { fromZoneId, toZoneId },
                          )
                        }
                        className={cn(
                          "w-full px-3 py-2 text-right tabular-nums outline-none",
                          rate
                            ? "hover:bg-muted focus-visible:bg-muted font-medium"
                            : "text-muted-foreground hover:bg-destructive/5 focus-visible:bg-destructive/5",
                          isSelected && "bg-muted",
                        )}
                      >
                        {rate ? (
                          formatTk(rate.baseRate)
                        ) : (
                          <span
                            className="text-muted-foreground/60"
                            data-testid="zone-matrix-unpriced"
                          >
                            —
                          </span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div
        className="border-border rounded-lg border p-4"
        data-testid="zone-matrix-detail"
        aria-live="polite"
      >
        {selected ? (
          selectedRate ? (
            <div className="space-y-3">
              <p className="font-medium" data-testid="zone-matrix-detail-lane">
                {nameOf(selected.fromZoneId)} → {nameOf(selected.toZoneId)}
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Detail
                  label="Base rate"
                  value={formatTk(selectedRate.baseRate)}
                />
                <Detail
                  label="Extra per KG"
                  value={formatTk(selectedRate.extraRatePerKg)}
                />
                <Detail
                  label="Free weight"
                  value={`${selectedRate.freeWeightKg} KG`}
                />
                <Detail
                  label="Max weight"
                  value={`${selectedRate.maxWeightKg} KG`}
                />
                <Detail
                  label="COD fee"
                  value={`${selectedRate.codFeePercentage}%`}
                />
                <Detail
                  label="Cancellation fee"
                  value={formatTk(selectedRate.cancellationFee)}
                />
              </dl>
            </div>
          ) : (
            <div className="space-y-2">
              <p
                className="text-destructive font-medium"
                data-testid="zone-matrix-detail-lane"
              >
                {nameOf(selected.fromZoneId)} → {nameOf(selected.toZoneId)}
              </p>
              <p className="text-muted-foreground text-sm">
                No rate is configured for this route, so parcels cannot be
                booked on it.
              </p>
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            Select a cell to see that route&apos;s full rates — extra per KG,
            free and maximum weight, COD fee and cancellation fee.
          </p>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
