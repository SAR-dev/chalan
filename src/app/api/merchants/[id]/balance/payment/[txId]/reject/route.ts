import { and, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { balancePaymentRejectSchema, parseBody } from "@/lib/validation"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; txId: string }> },
) {
  const me = await requireSession()
  if (!me) return unauthorized()

  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const { id: merchantId, txId } = await params

  const parsed = await parseBody(req, balancePaymentRejectSchema)
  if (parsed.error) return parsed.error
  const { reason } = parsed.data

  const limited = rateLimit(`balance-reject:${getClientIp(req)}`, 20, 60)
  if (limited) return limited

  const committed: { row: typeof balanceTransaction.$inferSelect | null } = {
    row: null,
  }

  const response = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: balanceTransaction.id,
        merchantId: balanceTransaction.merchantId,
        type: balanceTransaction.type,
        amount: balanceTransaction.amount,
        status: balanceTransaction.status,
      })
      .from(balanceTransaction)
      .where(
        and(
          eq(balanceTransaction.id, txId),
          eq(balanceTransaction.merchantId, merchantId),
        ),
      )
      .for("update")
      .limit(1)

    if (!current) return notFound()

    if (current.status !== "PENDING") {
      return conflict("This payment has already been reviewed.")
    }

    // Reject — balance is NOT touched, but pending amount must be cleared.
    const pendingAmount = -current.amount
    const [updated] = await tx
      .update(balanceTransaction)
      .set({
        status: "REJECTED",
        reviewedBy: me.name,
        reviewedAt: new Date().toISOString(),
        rejectReason: reason.trim(),
      })
      .where(eq(balanceTransaction.id, txId))
      .returning()

    // Clear the pending amount that was added when the payment was submitted.
    await tx
      .insert(merchantBalance)
      .values({ merchantId, pendingBalance: -pendingAmount })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          pendingBalance: sql`GREATEST(0, ${merchantBalance.pendingBalance} - ${pendingAmount})`,
          updatedAt: new Date().toISOString(),
        },
      })

    committed.row = updated
    return NextResponse.json(updated)
  })

  if (committed.row) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "BALANCE_PAYMENT_REJECTED",
      entityType: "balance_transaction",
      entityId: committed.row.id,
      description: `Rejected payment from merchant ${merchantId}: ${reason.trim()}`,
    })
  }

  return response
}
