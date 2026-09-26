import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user, warehouse } from "@/lib/db/schema"
import { SEED_ADMIN_USERS } from "@/lib/db/seed/seed-content"
import { createUser, log } from "./helpers"

export async function seedUsers() {
  log("Seeding admin users…")

  for (const entry of SEED_ADMIN_USERS) {
    await createUser(entry)
  }

  log("Back-filling warehouse.managedBy…")
  const [rifat] = await db
    .select()
    .from(user)
    .where(eq(user.email, "warehouse.admin1@email.com"))
    .limit(1)
  const [maliha] = await db
    .select()
    .from(user)
    .where(eq(user.email, "warehouse.admin2@email.com"))
    .limit(1)
  if (rifat) {
    await db
      .update(warehouse)
      .set({ managedBy: rifat.id })
      .where(eq(warehouse.id, "WH-100001E"))
    log("  set Dhaka Central Hub managedBy → Rifat")
  }
  if (maliha) {
    await db
      .update(warehouse)
      .set({ managedBy: maliha.id })
      .where(eq(warehouse.id, "WH-100002E"))
    log("  set Chattogram Port Hub managedBy → Maliha")
  }
}
