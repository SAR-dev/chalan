import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
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

  const approveds = await db
    .select({ id: payoutRequest.id })
    .from(payoutRequest)
    .where(
      and(inArray(payoutRequest.id, ids), eq(payoutRequest.status, "APPROVED")),
    )

  if (approveds.length === 0) {
    return badRequest("No APPROVED payout requests found for the given IDs.")
  }

  const approvedIds = approveds.map((p) => p.id)
  const updated = await db
    .update(payoutRequest)
    .set({ status: "PAID", paidAt: new Date().toISOString() })
    .where(
      and(
        inArray(payoutRequest.id, approvedIds),
        eq(payoutRequest.status, "APPROVED"),
      ),
    )
    .returning()

  await Promise.all(
    updated.map((p) =>
      logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PAYOUT_PAID",
        entityType: "payout_request",
        entityId: p.id,
        description: `Marked payout request ${p.id} as paid`,
      }),
    ),
  )

  return NextResponse.json({ ok: true, count: updated.length })
})
