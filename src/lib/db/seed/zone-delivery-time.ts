import { db } from "@/lib/db"
import { zoneDeliveryTime } from "@/lib/db/schema"
import { log } from "./helpers"

/**
 * Days from order creation to delivery, per zone pair — the same 3×3 matrix
 * shape as the pricing seed, over the same zone ids.
 *
 * The numbers are deliberately *consistent with the rates above them*: Dhaka
 * Metro is the hub, so it is quickest, and Remote Areas costs more days the same
 * way it costs more money. An admin changing these later does not move an
 * existing order's promise — orders snapshot the number at creation.
 */
export const DELIVERY_TIME_MATRIX: {
  fromZoneId: string
  toZoneId: string
  deliveryDays: number
}[] = [
  // From Dhaka Metro
  { fromZoneId: "DZ-100001E", toZoneId: "DZ-100001E", deliveryDays: 1 },
  { fromZoneId: "DZ-100001E", toZoneId: "DZ-100002E", deliveryDays: 2 },
  { fromZoneId: "DZ-100001E", toZoneId: "DZ-100003E", deliveryDays: 4 },

  // From Divisional Cities
  { fromZoneId: "DZ-100002E", toZoneId: "DZ-100001E", deliveryDays: 2 },
  { fromZoneId: "DZ-100002E", toZoneId: "DZ-100002E", deliveryDays: 2 },
  { fromZoneId: "DZ-100002E", toZoneId: "DZ-100003E", deliveryDays: 4 },

  // From Remote Areas
  { fromZoneId: "DZ-100003E", toZoneId: "DZ-100001E", deliveryDays: 3 },
  { fromZoneId: "DZ-100003E", toZoneId: "DZ-100002E", deliveryDays: 3 },
  { fromZoneId: "DZ-100003E", toZoneId: "DZ-100003E", deliveryDays: 3 },
]

export async function seedZoneDeliveryTime() {
  log("Seeding zone delivery time matrix…")

  const existing = await db.select().from(zoneDeliveryTime).limit(1)
  if (existing.length > 0) {
    log("  zone delivery time already exists, skipping")
    return
  }

  await db.insert(zoneDeliveryTime).values(DELIVERY_TIME_MATRIX)
  log(`  created ${DELIVERY_TIME_MATRIX.length} zone delivery time rows`)
}
