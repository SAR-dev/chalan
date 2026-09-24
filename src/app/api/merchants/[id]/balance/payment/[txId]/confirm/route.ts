import { and, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (
    req: Request,
    { params }: { params: Promise<{ id: string; txId: string }> },
  ) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id: merchantId, txId } = await params

    const limited = await rateLimitByIp(req, "balance-confirm", 20, 60)
    if (limited) return limited

    const committed: {
      row: typeof balanceTransaction.$inferSelect | null
      before: Record<string, unknown> | null
    } = {
      row: null,
      before: null,
    }

    const response = await db.transaction(async (tx) => {
      // Lock the transaction row to prevent two admins confirming simultaneously.
      const [current] = await tx
        .select({
          id: balanceTransaction.id,
          merchantId: balanceTransaction.merchantId,
          type: balanceTransaction.type,
          amount: balanceTransaction.amount,
          status: balanceTransaction.status,
          reviewedBy: balanceTransaction.reviewedBy,
          reviewedAt: balanceTransaction.reviewedAt,
          rejectReason: balanceTransaction.rejectReason,
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

      if (current.type !== "PAYMENT_PENDING") {
        return badRequest("Only PAYMENT_PENDING transactions can be confirmed.")
      }

      if (current.status !== "PENDING") {
        return conflict("This payment has already been reviewed.")
      }

      // Mark transaction as confirmed.
      const [updated] = await tx
        .update(balanceTransaction)
        .set({
          status: "SETTLED",
          type: "PAYMENT_CONFIRMED",
          reviewedBy: me.name,
          reviewedAt: new Date().toISOString(),
        })
        .where(eq(balanceTransaction.id, txId))
        .returning()

      // Reduce the merchant's running balance and clear the pending amount.
      // current.amount is already negative (set that way on submission),
      // so adding it reduces the balance.
      const pendingAmount = -current.amount
      await tx
        .insert(merchantBalance)
        .values({
          merchantId,
          balance: current.amount,
          pendingBalance: -pendingAmount,
        })
        .onConflictDoUpdate({
          target: merchantBalance.merchantId,
          set: {
            balance: sql`${merchantBalance.balance} + ${current.amount}`,
            pendingBalance: sql`${merchantBalance.pendingBalance} - ${pendingAmount}`,
            updatedAt: new Date().toISOString(),
          },
        })

      committed.row = updated
      committed.before = current
      return NextResponse.json(updated)
    })

    if (committed.row) {
      const diff = diffEntity(committed.before, committed.row, [
        "status",
        "type",
        "reviewedBy",
        "reviewedAt",
        "rejectReason",
      ])
      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "BALANCE_PAYMENT_CONFIRMED",
        entityType: "balance_transaction",
        entityId: committed.row.id,
        description: `Confirmed payment of ${Math.abs(committed.row.amount)} Tk from merchant ${merchantId}`,
        metadata: diff ? { diff } : null,
      })
    }

    return response
  },
)
