import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import {
  ADMIN_USER_NAMES,
  MERCHANT_IDS,
  SEED_ORDERS,
  SEED_PAYOUT_REQUESTS,
} from "@/lib/db/seed/seed-content"
import { log } from "./helpers"

export async function seedBalances() {
  log("Seeding merchant balances and transactions…")

  // Check if already seeded
  const existing = await db.select().from(merchantBalance).limit(1)
  if (existing.length > 0) {
    log("  balances already exist, skipping")
    return
  }

  // 1. Insert ORDER_CHARGE transactions for every order
  log("  creating ORDER_CHARGE transactions…")
  const BATCH = 25
  for (let i = 0; i < SEED_ORDERS.length; i += BATCH) {
    const batch = SEED_ORDERS.slice(i, i + BATCH).map((o) => ({
      id: `BT-${o.id}`,
      merchantId: o.merchantId,
      type: "ORDER_CHARGE" as const,
      amount: o.deliveryFee + o.codFee,
      status: "SETTLED" as const,
      note: `Order ${o.id} — delivery charge + COD fee`,
      orderId: o.id,
      createdBy: "system",
    }))
    await db.insert(balanceTransaction).values(batch)
  }
  log(`  created ${SEED_ORDERS.length} ORDER_CHARGE transactions`)

  // 1b. Insert ORDER_EARNINGS transactions for delivered orders
  log("  creating ORDER_EARNINGS transactions for delivered orders…")
  const deliveredOrders = SEED_ORDERS.filter((o) => o.status === "DELIVERED")
  for (let i = 0; i < deliveredOrders.length; i += BATCH) {
    const batch = deliveredOrders.slice(i, i + BATCH).map((o) => ({
      id: `BTE-${o.id}`,
      merchantId: o.merchantId,
      type: "ORDER_EARNINGS" as const,
      amount: -(o.productCost - o.deliveryFee - o.codFee),
      status: "SETTLED" as const,
      note: `Order ${o.id} — merchant earnings`,
      orderId: o.id,
      createdBy: "system",
    }))
    await db.insert(balanceTransaction).values(batch)
  }
  log(`  created ${deliveredOrders.length} ORDER_EARNINGS transactions`)

  // 2. Insert PAYMENT_CONFIRMED transaction for the approved payout
  const approvedPayout = SEED_PAYOUT_REQUESTS.find(
    (p) => p.status === "APPROVED",
  )
  if (approvedPayout) {
    await db.insert(balanceTransaction).values({
      id: "BT-100001E",
      merchantId: approvedPayout.merchantId,
      type: "PAYMENT_CONFIRMED",
      amount: -approvedPayout.amount,
      status: "SETTLED",
      note: `Payout ${approvedPayout.id} confirmed`,
      paymentMethod: approvedPayout.payoutMethod,
      paymentAccount: approvedPayout.payoutDetails,
      reviewedBy: ADMIN_USER_NAMES.nadia,
      reviewedAt: approvedPayout.reviewedAt,
      createdBy: ADMIN_USER_NAMES.nadia,
    })
    log("  created PAYMENT_CONFIRMED transaction for approved payout")
  }

  // 3. Insert PAYMENT_PENDING transaction for the pending payout
  const pendingPayout = SEED_PAYOUT_REQUESTS.find((p) => p.status === "PENDING")
  if (pendingPayout) {
    await db.insert(balanceTransaction).values({
      id: "BT-100002E",
      merchantId: pendingPayout.merchantId,
      type: "PAYMENT_PENDING",
      amount: -pendingPayout.amount,
      status: "PENDING",
      note: `Payout ${pendingPayout.id} — awaiting confirmation`,
      paymentMethod: pendingPayout.payoutMethod,
      paymentAccount: pendingPayout.payoutDetails,
      createdBy: pendingPayout.merchantId,
    })
    log("  created PAYMENT_PENDING transaction for pending payout")
  }

  // 4. Upsert merchant_balance for each active merchant
  log("  upserting merchant_balance rows…")
  const activeMerchantIds = [
    MERCHANT_IDS.merchant1,
    MERCHANT_IDS.merchant2,
    MERCHANT_IDS.merchant3,
  ]

  for (const merchantId of activeMerchantIds) {
    // Sum all settled transaction amounts for this merchant
    const balanceResult = await db
      .select({
        total: sql<number>`coalesce(sum(${balanceTransaction.amount}), 0)`,
      })
      .from(balanceTransaction)
      .where(
        sql`${balanceTransaction.merchantId} = ${merchantId} AND ${balanceTransaction.status} = 'SETTLED'`,
      )

    const balance = balanceResult[0]?.total ?? 0

    // Sum pending payment amounts
    const pendingResult = await db
      .select({
        total: sql<number>`coalesce(sum(abs(${balanceTransaction.amount})), 0)`,
      })
      .from(balanceTransaction)
      .where(
        sql`${balanceTransaction.merchantId} = ${merchantId} AND ${balanceTransaction.type} = 'PAYMENT_PENDING' AND ${balanceTransaction.status} = 'PENDING'`,
      )

    const pendingBalance = pendingResult[0]?.total ?? 0

    await db.insert(merchantBalance).values({
      id: `MB-${merchantId}`,
      merchantId,
      balance,
      pendingBalance,
    })
    log(
      `  created balance for ${merchantId}: ${balance} (pending: ${pendingBalance})`,
    )
  }

  log("  merchant balances seeded")
}
