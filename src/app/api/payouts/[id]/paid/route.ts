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
import {
  type SettlePayoutResult,
  settlePayoutAsPaid,
} from "@/lib/payout-settlement"
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

    // Shared settlement (ROADMAP P0.3): locks the request row, recomputes the
    // amount from the linked orders, writes the ledger + balance exactly once.
    const committed: { result: SettlePayoutResult | null } = { result: null }
    const response = await db.transaction(async (tx) => {
      const result = await settlePayoutAsPaid(tx, id, me.name)
      committed.result = result

      if (!result.ok) {
        if (result.reason === "not_found") return notFound()
        if (result.reason === "not_approved") {
          return badRequest("Only APPROVED requests can be marked paid.")
        }
        return badRequest("This payout request has no linked orders.")
      }

      return NextResponse.json(result.after)
    })

    if (committed.result?.ok) {
      const { before, after } = committed.result
      const diff = diffEntity(before, after, ["status", "amount", "paidAt"])
      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "PAYOUT_PAID",
        entityType: "payout_request",
        entityId: after.id,
        description: `Marked payout request ${after.id} as paid`,
        metadata: diff ? { diff } : null,
      })
    }

    return response
  },
)
