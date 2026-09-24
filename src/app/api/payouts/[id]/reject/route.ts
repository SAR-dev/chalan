import { eq } from "drizzle-orm"
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
import { order, payoutRequest } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { parseBody, payoutRejectSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params
    const parsed = await parseBody(req, payoutRejectSchema)
    if (parsed.error) return parsed.error
    const { reason } = parsed.data

    const limited = await rateLimitByIp(req, "payout-reject", 20, 60)
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
        return badRequest("Only PENDING requests can be rejected.")
      }

      // Unlock orders before updating the request status.
      await tx
        .update(order)
        .set({ payoutRequestId: null })
        .where(eq(order.payoutRequestId, id))

      const [updated] = await tx
        .update(payoutRequest)
        .set({
          status: "REJECTED",
          reviewedBy: me.name,
          reviewedAt: new Date().toISOString(),
          rejectReason: reason.trim(),
        })
        .where(eq(payoutRequest.id, id))
        .returning()

      committed.row = updated
      committed.before = current
      return NextResponse.json(updated)
    })

    if (committed.row) {
      const diff = diffEntity(committed.before, committed.row, [
        "status",
        "reviewedBy",
        "reviewedAt",
        "rejectReason",
        "paidAt",
      ])
      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PAYOUT_REJECTED",
        entityType: "payout_request",
        entityId: committed.row.id,
        description: `Rejected payout request ${committed.row.id}: ${reason.trim()}`,
        metadata: diff ? { diff } : null,
      })
    }

    return response
  },
)
