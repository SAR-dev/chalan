import { createId } from "@paralleldrive/cuid2"
import { eq, sql } from "drizzle-orm"
import { payoutAmount } from "@/lib/balance-ledger"
import { db } from "@/lib/db"
import { sumMoney } from "@/lib/db/money-sql"
import {
  balanceTransaction,
  merchantBalance,
  order,
  payoutRequest,
} from "@/lib/db/schema"

/** Transaction handle as passed by `db.transaction()`. */
export type PayoutTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type SettlePayoutResult =
  | {
      ok: true
      before: typeof payoutRequest.$inferSelect
      after: typeof payoutRequest.$inferSelect
      /** Recomputed from the orders actually linked to the request. */
      amount: number
    }
  | { ok: false; reason: "not_found" | "not_approved" | "no_orders" }

/**
 * Marks an APPROVED payout request as PAID and writes the money movement
 *. Shared by the single and the bulk admin endpoints so the two
 * paths can never diverge again:
 *
 *   - locks the request row (`FOR UPDATE`) so concurrent calls cannot double-pay;
 *   - recomputes the amount from the orders actually linked to the request and
 *     never trusts the stored amount (a legacy/orphan request has none);
 *   - refuses a request with **no linked orders** (the old race could create
 *     one carrying an amount with nothing behind it);
 *   - writes exactly one PAYOUT ledger row and one balance debit.
 *
 * Must be called inside a transaction.
 */
export async function settlePayoutAsPaid(
  tx: PayoutTx,
  payoutId: string,
  actorName: string,
): Promise<SettlePayoutResult> {
  const [current] = await tx
    .select()
    .from(payoutRequest)
    .where(eq(payoutRequest.id, payoutId))
    .for("update")
    .limit(1)

  if (!current) return { ok: false, reason: "not_found" }
  if (current.status !== "APPROVED") {
    return { ok: false, reason: "not_approved" }
  }

  const [totals] = await tx
    .select({
      orderCount: sql<number>`count(*)::int`,
      total: sumMoney(order.merchantEarnings),
    })
    .from(order)
    .where(eq(order.payoutRequestId, payoutId))

  if (Number(totals?.orderCount ?? 0) === 0) {
    return { ok: false, reason: "no_orders" }
  }

  const amount = Number(totals?.total ?? 0)
  const paidAt = new Date().toISOString()
  // A payout consumes the merchant's credit, so in the debt convention
  // (positive = merchant owes) it is a POSITIVE amount.
  const paid = payoutAmount(amount)

  const [after] = await tx
    .update(payoutRequest)
    .set({ status: "PAID", paidAt, amount })
    .where(eq(payoutRequest.id, payoutId))
    .returning()

  await tx.insert(balanceTransaction).values({
    merchantId: current.merchantId,
    type: "PAYOUT",
    amount: paid,
    status: "SETTLED",
    note: `Payout ${payoutId} paid`,
    createdBy: actorName,
  })

  await tx
    .insert(merchantBalance)
    .values({
      id: createId(),
      merchantId: current.merchantId,
      balance: paid,
    })
    .onConflictDoUpdate({
      target: merchantBalance.merchantId,
      set: {
        balance: sql`${merchantBalance.balance} + ${paid}`,
        updatedAt: paidAt,
      },
    })

  return { ok: true, before: current, after, amount }
}
