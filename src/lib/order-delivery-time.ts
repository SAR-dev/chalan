import { and, eq } from "drizzle-orm"
import { dbRead } from "@/lib/db"
import { zoneDeliveryTime } from "@/lib/db/schema"
import type { ZoneRef, ZoneResolutionReason } from "@/lib/pricing"
import { type RouteZoneRunner, resolveRouteZones } from "@/lib/route-zones"

/**
 * The `zone_delivery_time` matrix for a route.
 *
 * This module reads the database, so it is server-only. The arithmetic that
 * turns those days into a promise lives in `delivery-promise.ts` instead, for
 * the same reason `order-timeline.ts` sits apart from `track/[id]/lib.ts`: the
 * order drawer and the tracking page need the arithmetic and run in the
 * browser, where this file's `pg` import cannot go.
 *
 * Re-exported for server callers that already reach for this module.
 */
export {
  computeActualDeliveryDays,
  computeExpectedDeliveryAt,
  deliveryOutcome,
} from "@/lib/delivery-promise"

/**
 * Why a route has no delivery-time estimate.
 *
 * The zone reasons are shared with pricing (one vocabulary, one derivation), and
 * the matrix reason is its own: a lane with no `zone_delivery_time` row is a
 * *display* gap, not a blocker.
 */
export type DeliveryTimeUnavailableReason =
  | ZoneResolutionReason
  | "no-delivery-time-for-lane"

export type ResolveRouteDeliveryTimeResult =
  | { ok: true; days: number }
  | {
      ok: false
      reason: DeliveryTimeUnavailableReason
      fromZone: ZoneRef | null
      toZone: ZoneRef | null
    }

/**
 * Reads the `zone_delivery_time` matrix for a route.
 *
 * Deliberately non-blocking by contract: order creation treats a failure here as
 * "no estimate" and proceeds, because pricing blocking is about money owed while
 * a missing delivery date is a gap in what we can promise. Callers still get the
 * reason so the admin zone page can show which pair is unconfigured.
 *
 * Zone resolution is `resolveRouteZones`, shared with `resolveRoutePricing` —
 * so a lane can never be priced from one pair of zones and promised from another.
 */
export async function resolveRouteDeliveryTime(
  originWarehouseId: string,
  deliveryCityId: string | null,
  runner: RouteZoneRunner = dbRead,
): Promise<ResolveRouteDeliveryTimeResult> {
  const zones = await resolveRouteZones(
    originWarehouseId,
    deliveryCityId,
    runner,
  )
  if (!zones.ok) return zones

  const [row] = await runner
    .select()
    .from(zoneDeliveryTime)
    .where(
      and(
        eq(zoneDeliveryTime.fromZoneId, zones.fromZone.id),
        eq(zoneDeliveryTime.toZoneId, zones.toZone.id),
      ),
    )
    .limit(1)

  if (!row) {
    return {
      ok: false,
      reason: "no-delivery-time-for-lane",
      fromZone: zones.fromZone,
      toZone: zones.toZone,
    }
  }

  return { ok: true, days: row.deliveryDays }
}
