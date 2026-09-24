import { createId } from "@paralleldrive/cuid2"
import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance, payoutRequest } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const limited = await rateLimitByIp(req, "payout-paid", 20, 60)
    if (limited) return limited

    const { id } = await params

    // Transaction: lock the request row for the guard + write so a concurrent
    // call can't slip in between the "still APPROVED" check and the write.
    const committed: { row: typeof payoutRequest.$inferSelect | null } = {
      row: null,
    }
    const response = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: payoutRequest.status,
          amount: payoutRequest.amount,
          merchantId: payoutRequest.merchantId,
        })
        .from(payoutRequest)
        .where(eq(payoutRequest.id, id))
        .for("update")
        .limit(1)

      if (!current) return notFound()
      if (current.status !== "APPROVED") {
        return badRequest("Only APPROVED requests can be marked paid.")
      }

      const [updated] = await tx
        .update(payoutRequest)
        .set({ status: "PAID", paidAt: new Date().toISOString() })
        .where(eq(payoutRequest.id, id))
        .returning()

      // Create PAYOUT balance transaction — reduces merchant debt
      await tx.insert(balanceTransaction).values({
        merchantId: current.merchantId,
        type: "PAYOUT",
        amount: -current.amount,
        status: "SETTLED",
        note: `Payout ${id} paid`,
        createdBy: me.name,
      })

      // Reduce merchant balance
      await tx
        .insert(merchantBalance)
        .values({
          id: createId(),
          merchantId: current.merchantId,
          balance: -current.amount,
        })
        .onConflictDoUpdate({
          target: merchantBalance.merchantId,
          set: {
            balance: sql`${merchantBalance.balance} - ${current.amount}`,
            updatedAt: new Date().toISOString(),
          },
        })

      committed.row = updated
      return NextResponse.json(updated)
    })

    if (committed.row) {
      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PAYOUT_PAID",
        entityType: "payout_request",
        entityId: committed.row.id,
        description: `Marked payout request ${committed.row.id} as paid`,
      })
    }

    return response
  },
)
