import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import { sumMoney } from "@/lib/db/money-sql"
import { order, payoutRequest } from "@/lib/db/schema"
import { emitOrderEvent } from "@/lib/order-events"
import { rateLimitByIp } from "@/lib/rate-limit"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const limited = await rateLimitByIp(req, "payout-approve", 20, 60)
    if (limited) return limited

    // Transaction: lock the request row for the guard + write so two
    // concurrent approve/reject calls on the same request can't both pass the
    // "still PENDING" check against stale state.
    const committed: {
      row: typeof payoutRequest.$inferSelect | null
      before: Record<string, unknown> | null
    } = {
      row: null,
      before: null,
    }
    const response = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: payoutRequest.status,
          reviewedBy: payoutRequest.reviewedBy,
          reviewedAt: payoutRequest.reviewedAt,
          rejectReason: payoutRequest.rejectReason,
          paidAt: payoutRequest.paidAt,
        })
        .from(payoutRequest)
        .where(eq(payoutRequest.id, id))
        .for("update")
        .limit(1)

      if (!current) return notFound()
      if (current.status !== "PENDING") {
        return badRequest("Only PENDING requests can be approved.")
      }

      // A payout must actually reference orders: the old create
      // race could produce a request carrying an amount with nothing behind it.
      // Recompute from the linked orders so the stored amount is always honest.
      const [totals] = await tx
        .select({
          orderCount: sql<number>`count(*)::int`,
          total: sumMoney(order.merchantEarnings),
        })
        .from(order)
        .where(eq(order.payoutRequestId, id))

      if (Number(totals?.orderCount ?? 0) === 0) {
        return badRequest("This payout request has no linked orders.")
      }

      const [updated] = await tx
        .update(payoutRequest)
        .set({
          status: "APPROVED",
          amount: Number(totals?.total ?? 0),
          reviewedBy: me.name,
          reviewedAt: new Date().toISOString(),
        })
        .where(eq(payoutRequest.id, id))
        .returning()

      committed.row = updated
      committed.before = current

      // Raised inside the transaction, so a merchant is never told their payout
      // was approved against a write that rolled back. This route used to write
      // only an audit row, which is a record for operators and reaches nobody.
      if (updated) {
        await emitOrderEvent({
          tx,
          event: "payout.approved",
          orderId: null,
          merchantId: updated.merchantId,
          actorName: me.name,
          data: { id: updated.id, amount: updated.amount },
        })
      }

      return NextResponse.json(updated)
    })

    if (committed.row) {
      const diff = diffEntity(committed.before, committed.row, [
        "status",
        "amount",
        "reviewedBy",
        "reviewedAt",
        "rejectReason",
        "paidAt",
      ])
      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PAYOUT_APPROVED",
        entityType: "payout_request",
        entityId: committed.row.id,
        description: `Approved payout request ${committed.row.id}`,
        metadata: diff ? { diff } : null,
      })
    }

    return response
  },
)
