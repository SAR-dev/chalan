import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
import { db } from "@/lib/db"
import { payoutRequest } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

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
      status: "APPROVED",
      reviewedBy: me.name,
      reviewedAt: new Date().toISOString(),
    })
    .where(
      and(
        inArray(payoutRequest.id, pendingIds),
        eq(payoutRequest.status, "PENDING"),
      ),
    )
    .returning()

  await logAuditMany(
    updated.map((p) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PAYOUT_APPROVED",
      entityType: "payout_request",
      entityId: p.id,
      description: `Approved payout request ${p.id}`,
    })),
  )

  return NextResponse.json({ ok: true, count: updated.length })
})
