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
