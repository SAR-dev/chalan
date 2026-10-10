import { and, eq, inArray, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
import { db } from "@/lib/db"
import { sumMoney } from "@/lib/db/money-sql"
import { order, payoutRequest } from "@/lib/db/schema"
import { emitOrderEvent } from "@/lib/order-events"
import { rateLimitByIp } from "@/lib/rate-limit"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const limited = await rateLimitByIp(req, "payout-bulk-approve", 20, 60)
  if (limited) return limited

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  const pendings = await db
    .select({ id: payoutRequest.id, merchantId: payoutRequest.merchantId })
    .from(payoutRequest)
    .where(
      and(inArray(payoutRequest.id, ids), eq(payoutRequest.status, "PENDING")),
    )

  if (pendings.length === 0) {
    return badRequest("No PENDING payout requests found for the given IDs.")
  }

  const reviewedAt = new Date().toISOString()
  const approved: { id: string }[] = []

  await db.transaction(async (tx) => {
    for (const { id, merchantId } of pendings) {
      const [current] = await tx
        .select({
          status: payoutRequest.status,
        })
        .from(payoutRequest)
        .where(eq(payoutRequest.id, id))
        .for("update")
        .limit(1)

      if (!current || current.status !== "PENDING") continue

      const [totals] = await tx
        .select({
          orderCount: sql<number>`count(*)::int`,
          total: sumMoney(order.merchantEarnings),
        })
        .from(order)
        .where(eq(order.payoutRequestId, id))

      if (Number(totals?.orderCount ?? 0) === 0) continue

      await tx
        .update(payoutRequest)
        .set({
          status: "APPROVED",
          amount: Number(totals?.total ?? 0),
          reviewedBy: me.name,
          reviewedAt,
        })
        .where(eq(payoutRequest.id, id))

      // One notification per approved request, inside the transaction — see the
      // single-approve route for why this cannot live after the commit.
      await emitOrderEvent({
        tx,
        event: "payout.approved",
        orderId: null,
        merchantId,
        actorName: me.name,
        data: { id, amount: Number(totals?.total ?? 0) },
      })

      approved.push({ id })
    }
  })

  if (approved.length === 0) {
    return badRequest("No payout requests could be approved.")
  }

  await logAuditMany(
    approved.map((p) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PAYOUT_APPROVED",
      entityType: "payout_request",
      entityId: p.id,
      description: `Approved payout request ${p.id}`,
    })),
  )

  return NextResponse.json({ ok: true, count: approved.length })
})
