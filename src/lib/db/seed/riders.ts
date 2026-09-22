import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { rider } from "@/lib/db/schema"
import { SEED_RIDERS } from "@/lib/db/seed/seed-content"
import { createUser, log } from "./helpers"

export async function seedRiders() {
  log("Seeding riders…")

  for (const entry of SEED_RIDERS) {
    const exists = await db.select().from(rider).where(eq(rider.id, entry.id))
    if (exists.length > 0) {
      log(`  skip rider ${entry.name}`)
      continue
    }
    const { password: _password, ...riderData } = entry
    await db.insert(rider).values(riderData)
    log(`  created rider ${entry.name}`)

    // Only create auth user for ACTIVE riders (PENDING riders don't have
    // auth accounts yet — they get one when approved).
    if (entry.status === "ACTIVE" || entry.isActive) {
      await createUser({
        name: entry.name,
        email: entry.email,
        password: entry.password,
        phone: entry.phone,
        role: "RIDER",
        isActive: true,
        riderId: entry.id,
      })
    }
  }
}
