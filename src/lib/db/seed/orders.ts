import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { SEED_CANCELLATION_FEE, SEED_ORDERS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedOrders() {
  log("Seeding orders…")

  const exists = await db
    .select()
    .from(order)
    .where(eq(order.id, SEED_ORDERS[0].id))
    .limit(1)
  if (exists.length > 0) {
    log("  orders already exist, skipping")
    return
  }

  // Insert in batches of 25 to avoid parameter limits
  const BATCH = 25
  for (let i = 0; i < SEED_ORDERS.length; i += BATCH) {
    const batch = SEED_ORDERS.slice(i, i + BATCH).map((entry) => ({
      // Spread rather than a hand-maintained field list. The previous version
      // destructured every column and projected it again, and the two lists
      // drifted: `itemType` was declared by the seed and silently dropped here,
      // so a freshly seeded database showed the column empty everywhere and the
      // feature looked wired up but never populated. A spread makes that class
      // of mistake a compile error instead — an entry field that is not an
      // `order` column no longer type-checks, and one that is cannot go missing.
      ...entry,
      // The only value the entry does not carry itself.
      cancellationFee: SEED_CANCELLATION_FEE,
    }))
    await db.insert(order).values(batch)
    log(`  inserted orders ${i + 1}–${Math.min(i + BATCH, SEED_ORDERS.length)}`)
  }

  log(`  seeded ${SEED_ORDERS.length} orders`)
}
