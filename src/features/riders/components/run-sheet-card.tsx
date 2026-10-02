"use client"

import { Loader2, MapPinned } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useRunSheet } from "@/features/riders/hooks/use-run-sheet"

/**
 * The rider's own plan of attack.
 *
 * Grouped by destination rather than rendered as one long list, because the
 * grouping *is* the advice: the rider can see that six stops across two zones
 * have become two runs instead of six crossings.
 */
export function RunSheetCard({ riderId }: { riderId?: string | null }) {
  const { stops, zoneHops, isLoading, isError, refresh } = useRunSheet(riderId)

  if (!riderId) return null

  return (
    <Card data-testid="run-sheet">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <MapPinned className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div>
              <h2 className="text-sm font-medium">Suggested run order</h2>
              <p className="text-muted-foreground text-xs">
                {isError
                  ? "Could not load your run order."
                  : isLoading
                    ? "Working out the shortest way round…"
                    : stops.length === 0
                      ? "No parcels on your run yet."
                      : `${stops.length} ${stops.length === 1 ? "parcel" : "parcels"} · ${zoneHops === 0 ? "one area" : `${zoneHops + 1} areas, ${zoneHops} ${zoneHops === 1 ? "crossing" : "crossings"}`}`}
              </p>
            </div>
          </div>
          {isLoading && <Loader2 className="size-4 animate-spin" />}
        </div>

        {stops.length > 0 && (
          <ol className="flex flex-col gap-2">
            {stops.map((stop) => (
              <li
                key={stop.orderId}
                data-testid={`run-sheet-stop-${stop.sequence}`}
                className="flex items-baseline gap-3"
              >
                <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                  {stop.sequence}.
                </span>
                <span className="flex flex-col">
                  <span
                    data-testid={`run-sheet-parcel-${stop.sequence}`}
                    className="font-mono text-xs font-medium"
                  >
                    {stop.orderId}
                  </span>
                  <span
                    data-testid={`run-sheet-destination-${stop.sequence}`}
                    className="text-muted-foreground text-xs"
                  >
                    {stop.cityName ?? "Destination not set"}
                    {stop.zoneName ? ` · ${stop.zoneName}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {isError && (
          <button
            type="button"
            onClick={() => refresh()}
            className="text-primary text-xs underline underline-offset-2"
          >
            Try again
          </button>
        )}
      </CardContent>
    </Card>
  )
}
