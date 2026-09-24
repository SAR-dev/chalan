import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { merchant, user } from "@/lib/db/schema"
import { SEED_MERCHANTS } from "@/lib/db/seed/seed-content"
import { createUser, log } from "./helpers"

export async function seedMerchants() {
  log("Seeding merchants…")

  for (const entry of SEED_MERCHANTS) {
    const exists = await db
      .select()
      .from(merchant)
      .where(eq(merchant.id, entry.id))
    if (exists.length > 0) {
      log(`  skip merchant ${entry.businessName}`)
      continue
    }
    const { password: _password, ...merchantData } = entry
    await db.insert(merchant).values(merchantData)
    log(`  created merchant ${entry.businessName}`)

    await createUser({
      name: entry.ownerName,
      email: entry.email,
      password: entry.password,
      phone: entry.phone,
      role: "MERCHANT",
      isActive: true,
      merchantId: entry.id,
    })

    // If the merchant has emailVerifiedAt set, mark the Better Auth user as
    // email-verified too so login doesn't get blocked.
    if (entry.emailVerifiedAt) {
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.email, entry.email))
    }
  }
}
