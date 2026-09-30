"use client"

import { ArrowRight, CheckCircle2, Circle } from "lucide-react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { usePricingCoverage } from "@/features/platform-config/hooks/use-pricing-coverage"

/**
 * A lane long enough to swamp the dashboard is a signal, not a list to read —
 * show the first few and point at the page that lists them all.
 */
const MAX_ROWS = 8

/**
 * Lists the delivery lanes that have no configured rate.
 *
 * Zone pricing is per lane and has no platform-wide fallback, so a pair missing
 * from `zone_pricing` cannot be ordered on. This is where an admin finds out
 * *before* a merchant does — otherwise the first sign is a rejected order.
 */
export function PricingCoverageCard() {
  const { missing, coverage, isLoading, error } = usePricingCoverage()

  // No reachable pairs at all means the origin zones could not be derived (no
  // warehouse whose city maps to a zoned delivery city). That is a different
  // problem from "rates are missing", so it gets its own copy.
  const noReachablePairs =
    coverage !== null && coverage.reachablePairCount === 0
  const allPriced =
    coverage !== null && missing.length === 0 && !noReachablePairs

  const description = error
    ? "Zone pricing coverage could not be loaded."
    : isLoading
      ? "Checking zone pricing coverage…"
      : noReachablePairs
        ? "No delivery lanes are reachable yet."
        : allPriced
          ? `All ${coverage.reachablePairCount} reachable route${coverage.reachablePairCount === 1 ? "" : "s"} have a rate.`
          : `${missing.length} of ${coverage?.reachablePairCount ?? 0} reachable route${coverage?.reachablePairCount === 1 ? "" : "s"} still need a rate.`

  return (
    <Card data-testid="pricing-coverage-card">
      <CardHeader>
        <CardTitle>Zone pricing coverage</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {error ? (
          <p
            className="text-muted-foreground px-3 py-2.5 text-sm"
            data-testid="pricing-coverage-error"
          >
            Couldn&apos;t reach the coverage endpoint. Reload to try again.
          </p>
        ) : isLoading || !coverage ? (
          <p className="text-muted-foreground px-3 py-2.5 text-sm">
            Checking zone pricing coverage…
          </p>
        ) : allPriced ? (
          <div
            className="flex items-center gap-3 rounded-md px-3 py-2.5"
            data-testid="pricing-coverage-clear"
          >
            <CheckCircle2 className="text-chart-2 size-5" />
            <span className="text-muted-foreground text-sm">
              Every reachable lane is priced.
            </span>
          </div>
        ) : noReachablePairs ? (
          <p
            className="text-muted-foreground px-3 py-2.5 text-sm"
            data-testid="pricing-coverage-empty"
          >
            Zone pricing is per route, and a route is only reachable once a
            warehouse sits in a zoned city. Create a delivery zone, assign the
            warehouse&apos;s city to it, then set the rates.
          </p>
        ) : (
          <>
            {missing.slice(0, MAX_ROWS).map((pair) => (
              <Link
                key={`${pair.fromZoneId}-${pair.toZoneId}`}
                href="/dashboard/zone-pricing"
                className="block"
              >
                <div
                  className="hover:bg-muted flex items-center gap-3 rounded-md px-3 py-2.5"
                  data-testid="pricing-coverage-missing"
                >
                  <Circle className="text-muted-foreground/50 size-5" />
                  <span className="flex-1 text-sm font-medium">
                    {pair.fromZoneName} → {pair.toZoneName}
                  </span>
                  <ArrowRight className="text-muted-foreground size-4" />
                </div>
              </Link>
            ))}
            {missing.length > MAX_ROWS ? (
              <p
                className="text-muted-foreground px-3 py-2.5 text-xs"
                data-testid="pricing-coverage-overflow"
              >
                and {missing.length - MAX_ROWS} more — see the zone rate card
                for the full list.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
