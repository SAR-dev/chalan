import { eq } from "drizzle-orm"
import { dbRead } from "@/lib/db"
import { deliveryCity, deliveryZone, warehouse } from "@/lib/db/schema"
import type { ZoneRef, ZoneResolutionReason } from "@/lib/pricing"

/**
 * Anything that can run a read against the routing tables: the pool-backed
 * `dbRead`, or a live transaction handle.
 *
 * Typed structurally as "anything with `select`" for the same reason
 * `PricingRunner` is — a `PgTransaction`'s `$client` differs from the pool's.
 */
export type RouteZoneRunner = Pick<typeof dbRead, "select">

export type RouteZones =
  | { ok: true; fromZone: ZoneRef; toZone: ZoneRef }
  | {
      ok: false
      reason: ZoneResolutionReason
      fromZone: ZoneRef | null
      toZone: ZoneRef | null
    }

/**
 * Resolves both ends of a route: the origin zone (the pickup warehouse's city,
 * matched by **name** against `delivery_city`) and the destination zone (the
 * order's delivery city).
 *
 * Shared by `zone_pricing` and `zone_delivery_time`, which are two different
 * matrices keyed by the same pair. The derivation is subtle enough — a warehouse
 * stores a *city name*, and only that name links it to a zone — that two copies
 * would eventually disagree about what a lane is; and a lane the two resolvers
 * disagree about is a price and a promised date that no longer describe the same
 * route.
 *
 * The failure reasons are reported with the zone already resolved where it was
 * known (so an admin sees which end of the pair is the problem), except
 * `destination-city-unknown` which returns neither — preserved exactly as the
 * original pricing path reported it, because changing what a reason carries is a
 * behaviour change and does not belong in an extraction.
 */
export async function resolveRouteZones(
  originWarehouseId: string,
  deliveryCityId: string | null,
  runner: RouteZoneRunner = dbRead,
): Promise<RouteZones> {
  const [w] = await runner
    .select({ city: warehouse.city })
    .from(warehouse)
    .where(eq(warehouse.id, originWarehouseId))
    .limit(1)

  const [origCity] = w?.city
    ? await runner
        .select({ zone: deliveryZone })
        .from(deliveryCity)
        .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
        .where(eq(deliveryCity.name, w.city))
        .limit(1)
    : []

  if (!origCity?.zone) {
    return {
      ok: false,
      reason: "origin-zone-unknown",
      fromZone: null,
      toZone: null,
    }
  }

  if (!deliveryCityId) {
    return {
      ok: false,
      reason: "destination-city-unknown",
      fromZone: null,
      toZone: null,
    }
  }

  const [destCity] = await runner
    .select({ zone: deliveryZone })
    .from(deliveryCity)
    .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
    .where(eq(deliveryCity.id, deliveryCityId))
    .limit(1)

  if (!destCity) {
    return {
      ok: false,
      reason: "destination-city-unknown",
      fromZone: null,
      toZone: null,
    }
  }

  if (!destCity.zone) {
    return {
      ok: false,
      reason: "destination-zone-unknown",
      fromZone: origCity.zone,
      toZone: null,
    }
  }

  return { ok: true, fromZone: origCity.zone, toZone: destCity.zone }
}
