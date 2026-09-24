import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { deliveryZone } from "@/lib/db/schema"
import { log } from "./helpers"

const ZONES = [
  { id: "DZ-100001E", name: "Dhaka Metro" },
  { id: "DZ-100002E", name: "Divisional Cities" },
  { id: "DZ-100003E", name: "Remote Areas" },
]

export async function seedDeliveryZones() {
  log("Seeding delivery zones…")

  for (const row of ZONES) {
    const exists = await db
      .select()
      .from(deliveryZone)
      .where(eq(deliveryZone.id, row.id))
    if (exists.length > 0) {
      log(`  skip zone ${row.name}`)
      continue
    }
    await db.insert(deliveryZone).values(row)
    log(`  created zone ${row.name}`)
  }
}
