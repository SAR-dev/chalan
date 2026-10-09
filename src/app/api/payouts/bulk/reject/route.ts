import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
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

  const reviewedAt = new Date().toISOString()
  const rejected: { id: string }[] = []

  await db.transaction(async (tx) => {
    for (const id of pendingIds) {
      const [current] = await tx
        .select({
          status: payoutRequest.status,
        })
        .from(payoutRequest)
        .where(eq(payoutRequest.id, id))
        .for("update")
        .limit(1)

      if (!current || current.status !== "PENDING") continue

      await tx
        .update(order)
        .set({ payoutRequestId: null })
        .where(eq(order.payoutRequestId, id))

      await tx
        .update(payoutRequest)
        .set({
          status: "REJECTED",
          reviewedBy: me.name,
          reviewedAt,
          rejectReason: reason.trim(),
        })
        .where(eq(payoutRequest.id, id))

      rejected.push({ id })
    }
  })

  if (rejected.length === 0) {
    return badRequest("No PENDING payout requests found for the given IDs.")
  }

  await logAuditMany(
    rejected.map((p) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PAYOUT_REJECTED",
      entityType: "payout_request",
      entityId: p.id,
      description: `Rejected payout request ${p.id}: ${reason.trim()}`,
    })),
  )

  return NextResponse.json({ ok: true, count: rejected.length })
})
