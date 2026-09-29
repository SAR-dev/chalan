import { eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { deliveryCity, pickupLocation } from "@/lib/db/schema"

/**
 * Resolve the warehouse that serves each pickup location via its delivery
 * city (pickup_location.cityId → delivery_city.warehouseId). Shared by the
 * order-create routes and the picked-up transition so the mapping can never
 * drift. A location with no city or no warehouse maps to null.
 */
export async function pickupWarehouseIds(
  pickupLocationIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (pickupLocationIds.length === 0) return new Map()
  const rows = await db
    .select({ id: pickupLocation.id, warehouseId: deliveryCity.warehouseId })
    .from(pickupLocation)
    .innerJoin(deliveryCity, eq(pickupLocation.cityId, deliveryCity.id))
    .where(inArray(pickupLocation.id, [...pickupLocationIds]))
  return new Map(rows.map((r) => [r.id, r.warehouseId]))
}

export async function pickupWarehouseId(
  pickupLocationId: string,
): Promise<string | null> {
  return (
    (await pickupWarehouseIds([pickupLocationId])).get(pickupLocationId) ?? null
  )
}

/**
 * The merchant that owns each pickup location.
 *
 * Order creation resolves a pickup location to its warehouse but must also
 * confirm the caller owns it — otherwise a merchant could attach another
 * merchant's shop address to their own order, sending riders to the wrong place
 * and breaking tenant integrity.
 */
export async function pickupLocationOwners(
  pickupLocationIds: readonly string[],
): Promise<Map<string, string>> {
  if (pickupLocationIds.length === 0) return new Map()
  const rows = await db
    .select({ id: pickupLocation.id, merchantId: pickupLocation.merchantId })
    .from(pickupLocation)
    .where(inArray(pickupLocation.id, [...pickupLocationIds]))
  return new Map(rows.map((r) => [r.id, r.merchantId]))
}

/** What an order-create route needs about a pickup location, in one query. */
export interface PickupLocationHub {
  merchantId: string
  warehouseId: string | null
}

/**
 * Resolves each pickup location's owning merchant AND serving warehouse in a
 * single query, so order creation can check ownership and routing together
 * instead of making two round trips.
 */
export async function pickupLocationHubs(
  pickupLocationIds: readonly string[],
): Promise<Map<string, PickupLocationHub>> {
  if (pickupLocationIds.length === 0) return new Map()
  const rows = await db
    .select({
      id: pickupLocation.id,
      merchantId: pickupLocation.merchantId,
      warehouseId: deliveryCity.warehouseId,
    })
    .from(pickupLocation)
    .leftJoin(deliveryCity, eq(pickupLocation.cityId, deliveryCity.id))
    .where(inArray(pickupLocation.id, [...pickupLocationIds]))
  return new Map(
    rows.map((r) => [
      r.id,
      { merchantId: r.merchantId, warehouseId: r.warehouseId ?? null },
    ]),
  )
}
