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
    .where(eq(user.email, "warehouse.admin01@email.com"))
    .limit(1)
  const [maliha] = await db
    .select()
    .from(user)
    .where(eq(user.email, "warehouse.admin02@email.com"))
    .limit(1)
  if (rifat) {
    await db
      .update(warehouse)
      .set({ managedBy: rifat.id })
      .where(eq(warehouse.id, "b5mujkfyyq6qqw5t1unbm8b7"))
    log("  set Dhaka Central Hub managedBy → Rifat")
  }
  if (maliha) {
    await db
      .update(warehouse)
      .set({ managedBy: maliha.id })
      .where(eq(warehouse.id, "op3s6e6t0q4oaerl6boqng1r"))
    log("  set Chattogram Port Hub managedBy → Maliha")
  }
}
