import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
import { db } from "@/lib/db"
import { payoutRequest } from "@/lib/db/schema"
import { settlePayoutAsPaid } from "@/lib/payout-settlement"
import { rateLimitByIp } from "@/lib/rate-limit"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const limited = await rateLimitByIp(req, "payout-bulk-paid", 20, 60)
  if (limited) return limited

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

  // Settle through the SAME helper as the single endpoint (ROADMAP P0.3) so a
  // bulk payout writes the ledger row and debits the balance exactly like a
  // single one — previously this path only flipped the status.
  const settled: string[] = []
  await db.transaction(async (tx) => {
    for (const { id } of approveds) {
      const result = await settlePayoutAsPaid(tx, id, me.name)
      // A request that changed state or has no linked orders is skipped rather
      // than aborting the whole batch; `count` reports what actually settled.
      if (result.ok) settled.push(id)
    }
  })

  if (settled.length === 0) {
    return badRequest("No payout requests could be settled.")
  }

  await logAuditMany(
    settled.map((id) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "PAYOUT_PAID",
      entityType: "payout_request",
      entityId: id,
      description: `Marked payout request ${id} as paid`,
    })),
  )

  return NextResponse.json({ ok: true, count: settled.length })
})
