import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { order, payoutRequest } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

const bulkRejectSchema = idsSchema.extend({
  reason: z.string().trim().min(1).default("Bulk reject"),
})

export const PATCH = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, bulkRejectSchema)
  if (parsed.error) return parsed.error
  const { ids, reason } = parsed.data

  const pendings = await db
    .select({ id: payoutRequest.id })
    .from(payoutRequest)
    .where(
      and(inArray(payoutRequest.id, ids), eq(payoutRequest.status, "PENDING")),
    )

  if (pendings.length === 0) {
    return badRequest("No PENDING payout requests found for the given IDs.")
  }

  const pendingIds = pendings.map((p) => p.id)

  const updated = await db
    .update(payoutRequest)
    .set({
      status: "REJECTED",
      reviewedBy: me.name,
      reviewedAt: new Date().toISOString(),
      rejectReason: reason.trim(),
    })
    .where(
      and(
        inArray(payoutRequest.id, pendingIds),
        eq(payoutRequest.status, "PENDING"),
      ),
    )
    .returning()

  if (updated.length === 0) {
    return badRequest("No PENDING payout requests found for the given IDs.")
  }

  const rejectedIds = updated.map((p) => p.id)
  await db
    .update(order)
    .set({ payoutRequestId: null })
    .where(inArray(order.payoutRequestId, rejectedIds))

  await Promise.all(
    updated.map((p) =>
      logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PAYOUT_REJECTED",
        entityType: "payout_request",
        entityId: p.id,
        description: `Rejected payout request ${p.id}: ${reason.trim()}`,
      }),
    ),
  )

  return NextResponse.json({ ok: true, count: updated.length })
})
