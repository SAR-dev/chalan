/**
 * The lane's maximum parcel weight, resolved client-side for display warnings.
 *
 * Pure module: every lookup is injected so the orders table and the order
 * detail view share one definition of "which lane is this order on" — the same
 * one `resolveRoutePricing` uses on the server, so a row warned about here is a
 * row the server would reject.
 *
 * The maximum parcel weight belongs to the lane (`zone_pricing.maxWeightKg`).
 * There is deliberately no per-merchant cap, so a row can be over-limit on one
 * route and fine on another.
 */

import type { ZonePricingEstimate } from "@/features/platform-config/hooks/use-zone-pricing-public"
import type { DeliveryCity, Warehouse } from "@/lib/types"

export interface LaneLookup {
  warehouses: ReadonlyArray<Pick<Warehouse, "id" | "city">>
  deliveryCities: ReadonlyArray<Pick<DeliveryCity, "id" | "name" | "zoneId">>
  zonePricing: ReadonlyArray<
    Pick<ZonePricingEstimate, "fromZoneId" | "toZoneId" | "maxWeightKg">
  >
}

export interface LaneCandidate {
  /**
   * Nullable and optional because `delivery_city.onDelete = "set null"` (and a
   * pre-assignment order may have no warehouse) — a lane that cannot be
   * resolved has no limit to report, which is what the helper returns.
   */
  warehouseId?: string | null
  deliveryCityId?: string | null
  parcelWeightKg: number
}

/**
 * The route's weight limit, or `null` when the lane cannot be resolved.
 *
 * `null` is deliberately distinct from "unlimited": an unresolvable lane has no
 * limit to report, and the server's own behaviour there is to reject at
 * creation rather than to guess, so nothing on screen should look authoritative.
 *
 * Mirrors `resolveRoutePricing`: the origin zone comes from
 * `warehouse.city` → `delivery_city.name`, the destination from the order's
 * `deliveryCityId`, and the rate from the ordered (fromZone → toZone) pair.
 */
export function laneMaxWeightKg(
  order: LaneCandidate,
  lookup: LaneLookup,
): number | null {
  const warehouse = order.warehouseId
    ? lookup.warehouses.find((w) => w.id === order.warehouseId)
    : undefined
  const origin = warehouse
    ? lookup.deliveryCities.find((c) => c.name === warehouse.city)
    : undefined
  const destination = lookup.deliveryCities.find(
    (c) => c.id === order.deliveryCityId,
  )
  if (!origin?.zoneId || !destination?.zoneId) return null

  const lane = lookup.zonePricing.find(
    (z) => z.fromZoneId === origin.zoneId && z.toZoneId === destination.zoneId,
  )
  return lane ? lane.maxWeightKg : null
}

/** Whether an order sits above its route's limit. `false` when unresolvable. */
export function exceedsLaneWeightLimit(
  order: LaneCandidate,
  lookup: LaneLookup,
): boolean {
  const limit = laneMaxWeightKg(order, lookup)
  return limit !== null && order.parcelWeightKg > limit
}
