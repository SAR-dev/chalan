import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { warehouse } from "@/lib/db/schema"
import { SEED_WAREHOUSES } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedWarehouses() {
  log("Seeding warehouses…")

  for (const row of SEED_WAREHOUSES) {
    const exists = await db
      .select()
      .from(warehouse)
      .where(eq(warehouse.id, row.id!))
    if (exists.length > 0) {
      log(`  skip warehouse ${row.name}`)
      continue
    }
    await db.insert(warehouse).values({ ...row, id: row.id! })
    log(`  created warehouse ${row.name}`)
  }
}
