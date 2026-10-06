"use client"

import { Pencil, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { ZoneDeliveryTime } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Zones × zones delivery-time matrix for an admin.
 *
 * The mirror of `ZoneRateMatrix`: where that answers "what does it cost", this
 * answers "how long does it take". Both are directional (X→Y and Y→X are
 * separate lanes), both treat a blank cell as "not configured" rather than
 * "instant", and both share the pair-keyed row shape.
 *
 * Two differences are deliberate:
 *
 * 1. **It is admin-only.** The pricing matrix is also shown to merchants
 *    (read-only); delivery times are negotiated after the fee is paid, so only
 *    the admin page renders this grid.
 * 2. **Selected cells can be edited and deleted.** A lane's promise is
 *    snapshotted onto an order at creation, so changing a number here affects
 *    only future orders — the safest field in the app to make actionable right
 *    from the grid. The edit/delete actions are owned by the parent page, which
 *    owns dialogs and toasts; this component only reports intent.
 */

interface ZoneDeliveryTimeMatrixProps {
  /** Active zones, for names. An id missing here falls back to its raw value. */
  zones: ReadonlyArray<{ id: string; name: string }>
  /** The lane rows to lay out. */
  rows: ReadonlyArray<ZoneDeliveryTime>
  /** Called when the user picks "Edit" for a selected lane. */
  onEdit: (row: ZoneDeliveryTime) => void
  /** Called when the user picks "Delete" for a selected lane. */
  onDelete: (row: ZoneDeliveryTime) => void
}

type Lane = { fromZoneId: string; toZoneId: string } | null

const DAYS_LABEL = (days: number) => (days === 1 ? "1 day" : `${days} days`)

export function ZoneDeliveryTimeMatrix({
  zones,
  rows,
  onEdit,
  onDelete,
}: ZoneDeliveryTimeMatrixProps) {
  const [selected, setSelected] = useState<Lane>(null)

  const zoneNameById = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones],
  )
  const nameOf = (id: string) => zoneNameById.get(id) ?? id

  // Rows are origins, columns are destinations. Both sets come from the rows
  // themselves (the union of each side), so every row and column shown has at
  // least one configured lane — a zone with no lanes at all is not a gap in the
  // matrix, it is a gap the admin list view reports as entirely unconfigured.
  const rowZoneIds = useMemo(
    () =>
      [...new Set(rows.map((r) => r.fromZoneId))].sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b)),
      ),
    // `nameOf` closes over `zoneNameById`; listing it keeps the memo honest.
    [rows, zoneNameById],
  )
  const colZoneIds = useMemo(
    () =>
      [...new Set(rows.map((r) => r.toZoneId))].sort((a, b) =>
        nameOf(a).localeCompare(nameOf(b)),
      ),
    [rows, zoneNameById],
  )

  const findRow = (fromZoneId: string, toZoneId: string) =>
    rows.find((r) => r.fromZoneId === fromZoneId && r.toZoneId === toZoneId) ??
    null

  const selectedId = selected
    ? `${selected.fromZoneId}:${selected.toZoneId}`
    : null
  const selectedRow = selected
    ? rows.find(
        (r) =>
          r.fromZoneId === selected.fromZoneId &&
          r.toZoneId === selected.toZoneId,
      )
    : null

  if (rows.length === 0) {
    return (
      <p
        className="text-muted-foreground rounded-lg border px-4 py-10 text-center text-sm"
        data-testid="zone-delivery-time-matrix-empty"
      >
        No delivery times have been configured yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        className="overflow-x-auto"
        data-testid="zone-delivery-time-matrix"
        aria-label="Delivery times by pickup and delivery zone"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
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
                  const row = findRow(fromZoneId, toZoneId)
                  const laneKey = `${fromZoneId}:${toZoneId}`
                  const isSelected = selectedId === laneKey
                  return (
                    <td
                      key={toZoneId}
                      className="px-0 py-0 text-right tabular-nums"
                    >
                      <button
                        type="button"
                        data-testid="zone-delivery-time-cell"
                        data-lane={laneKey}
                        data-configured={row ? "true" : "false"}
                        aria-pressed={isSelected}
                        aria-label={`${nameOf(fromZoneId)} to ${nameOf(
                          toZoneId,
                        )}: ${row ? DAYS_LABEL(row.deliveryDays) : "not configured"}`}
                        onClick={() =>
                          setSelected(
                            isSelected ? null : { fromZoneId, toZoneId },
                          )
                        }
                        className={cn(
                          "w-full px-3 py-2 text-right tabular-nums outline-none",
                          row
                            ? "hover:bg-muted focus-visible:bg-muted font-medium"
                            : "text-muted-foreground hover:bg-destructive/5 focus-visible:bg-destructive/5",
                          isSelected && "bg-muted",
                        )}
                      >
                        {row ? (
                          <>
                            {row.deliveryDays}
                            <span
                              className="text-muted-foreground/70 ml-0.5"
                              aria-hidden
                            >
                              d
                            </span>
                          </>
                        ) : (
                          <span
                            className="text-muted-foreground/60"
                            data-testid="zone-delivery-time-unconfigured"
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
        data-testid="zone-delivery-time-matrix-detail"
        aria-live="polite"
      >
        {selected ? (
          selectedRow ? (
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="zone-delivery-time-matrix-detail-configured"
            >
              <div className="space-y-1">
                <p
                  className="font-medium"
                  data-testid="zone-delivery-time-matrix-detail-lane"
                >
                  {nameOf(selected.fromZoneId)} → {nameOf(selected.toZoneId)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {DAYS_LABEL(selectedRow.deliveryDays)} from order creation.
                  Existing orders keep the date they were quoted.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="zone-delivery-time-matrix-edit"
                  onClick={() => onEdit(selectedRow)}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  data-testid="zone-delivery-time-matrix-delete"
                  onClick={() => {
                    setSelected(null)
                    onDelete(selectedRow)
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p
                className="text-destructive font-medium"
                data-testid="zone-delivery-time-matrix-detail-lane"
              >
                {nameOf(selected.fromZoneId)} → {nameOf(selected.toZoneId)}
              </p>
              <p className="text-muted-foreground text-sm">
                No delivery time is set for this route, so orders show no
                estimate until one is configured.
              </p>
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            Select a cell to see that route&apos;s delivery time — and edit or
            delete it from here.
          </p>
        )}
      </div>
    </div>
  )
}
