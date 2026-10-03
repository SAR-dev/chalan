import { db } from "@/lib/db"
import { deliveryCity } from "@/lib/db/schema"
import { SEED_DELIVERY_CITIES } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedDeliveryCities() {
  log("Seeding delivery cities…")

  const existing = await db.select().from(deliveryCity).limit(1)
  if (existing.length > 0) {
    log("  delivery cities already exist, skipping")
    return
  }

  await db.insert(deliveryCity).values(SEED_DELIVERY_CITIES)
  log(`  created ${SEED_DELIVERY_CITIES.length} delivery cities`)
}
