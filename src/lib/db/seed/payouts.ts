import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { payoutRequest } from "@/lib/db/schema"
import { SEED_PAYOUT_REQUESTS } from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedPayoutRequests() {
  log("Seeding payout requests…")

  const exists = await db
    .select()
    .from(payoutRequest)
    .where(eq(payoutRequest.id, SEED_PAYOUT_REQUESTS[0].id))
    .limit(1)
  if (exists.length > 0) {
    log("  payout requests already exist, skipping")
    return
  }

  for (const entry of SEED_PAYOUT_REQUESTS) {
    const {
      id,
      merchantId,
      orderIds,
      amount,
      status,
      payoutMethod,
      payoutDetails,
      requestedAt,
      reviewedBy,
      reviewedAt,
      rejectReason,
      paidAt,
    } = entry
    await db.insert(payoutRequest).values({
      id,
      merchantId,
      orderIds,
      amount,
      status,
      payoutMethod,
      payoutDetails,
      requestedAt,
      reviewedBy,
      reviewedAt,
      rejectReason,
      paidAt,
    })
    log(`  created payout request ${id} (${status})`)
  }
}
