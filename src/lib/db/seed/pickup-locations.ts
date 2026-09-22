import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { pickupLocation } from "@/lib/db/schema"
import { SEED_PICKUP_LOCATIONS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedPickupLocations() {
  log("Seeding pickup locations…")

  for (const entry of SEED_PICKUP_LOCATIONS) {
    const exists = await db
      .select()
      .from(pickupLocation)
      .where(eq(pickupLocation.id, entry.id))
    if (exists.length > 0) {
      log(`  skip pickup location ${entry.label}`)
      continue
    }
    await db.insert(pickupLocation).values(entry)
    log(`  created pickup location ${entry.label}`)
  }
}
