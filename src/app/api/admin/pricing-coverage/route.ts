import { asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import {
  deliveryCity,
  deliveryZone,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"
import type { PricingCoverage } from "@/lib/types"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * Zone-pair pricing coverage — the admin's list of lanes that cannot be ordered
 * on yet.
 *
 * Delivery pricing is per lane: one `zone_pricing` row per ordered
 * (fromZone → toZone) pair, with no platform-wide fallback. A pair with no row
 * has no rates at all, so this endpoint enumerates exactly those pairs.
 *
 * "Reachable" is deliberately narrower than the full N×N cross product: a pair
 * only matters if a warehouse actually ships from the origin zone AND a
 * delivery city exists in the destination zone. The origin set is derived the
 * same way `resolveRoutePricing` derives it — by matching `warehouse.city`
 * against `delivery_city.name` — so this list cannot disagree with what order
 * creation will actually accept.
 */
export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const [zones, origins, destinations, configured] = await Promise.all([
    dbRead
      .select({ id: deliveryZone.id, name: deliveryZone.name })
      .from(deliveryZone)
      .orderBy(asc(deliveryZone.name)),
    // Zones an order can originate from. The join mirrors the resolver's
    // fragile `warehouse.city = delivery_city.name` match on purpose: a
    // warehouse whose city is spelled differently resolves to no zone, and
    // therefore contributes no reachable pairs.
    dbRead
      .selectDistinct({ zoneId: deliveryCity.zoneId })
      .from(warehouse)
      .innerJoin(deliveryCity, eq(deliveryCity.name, warehouse.city))
      .innerJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id)),
    dbRead
      .selectDistinct({ zoneId: deliveryCity.zoneId })
      .from(deliveryCity)
      .innerJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id)),
    dbRead
      .select({
        fromZoneId: zonePricing.fromZoneId,
        toZoneId: zonePricing.toZoneId,
      })
      .from(zonePricing),
  ])

  const zoneNameById = new Map(zones.map((z) => [z.id, z.name]))

  // Filter to zones we can actually name, BEFORE counting. Otherwise a zone row
  // removed between the two reads would be counted as reachable while being
  // omitted from the list, and the card would promise more gaps than it shows.
  const isNamed = (zoneId: string | null): zoneId is string =>
    zoneId !== null && zoneNameById.has(zoneId)

  const fromZoneIds = [...new Set(origins.map((o) => o.zoneId).filter(isNamed))]
  const toZoneIds = [
    ...new Set(destinations.map((d) => d.zoneId).filter(isNamed)),
  ]
  const configuredPairs = new Set(
    configured.map((p) => `${p.fromZoneId}→${p.toZoneId}`),
  )

  const missing: PricingCoverage["missing"] = []
  for (const fromZoneId of fromZoneIds) {
    for (const toZoneId of toZoneIds) {
      if (configuredPairs.has(`${fromZoneId}→${toZoneId}`)) continue
      const fromZoneName = zoneNameById.get(fromZoneId)
      const toZoneName = zoneNameById.get(toZoneId)
      // Both are guaranteed by `isNamed`, so this can only drop a pair
      // between the reads rather than skew the count above.
      if (fromZoneName && toZoneName) {
        missing.push({ fromZoneId, fromZoneName, toZoneId, toZoneName })
      }
    }
  }
  missing.sort(
    (a, b) =>
      a.fromZoneName.localeCompare(b.fromZoneName) ||
      a.toZoneName.localeCompare(b.toZoneName),
  )

  const payload: PricingCoverage = {
    missing,
    reachablePairCount: fromZoneIds.length * toZoneIds.length,
    configuredPairCount: configured.length,
    originZoneCount: fromZoneIds.length,
    destinationZoneCount: toZoneIds.length,
  }
  return NextResponse.json(payload)
})
