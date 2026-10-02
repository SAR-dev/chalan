import { and, eq, ne } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { refreshStats, statTag } from "@/lib/cached-stats"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const [current] = await db
      .select({ status: merchant.status })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)

    if (!current) return notFound()
    if (current.status === "ACTIVE") {
      return badRequest("This merchant is already active")
    }

    // Only transition merchants that are not already active, so a concurrent
    // change can't be silently overwritten (ROADMAP P1.1).
    const [updated] = await db
      .update(merchant)
      .set({ status: "ACTIVE" })
      .where(and(eq(merchant.id, id), ne(merchant.status, "ACTIVE")))
      .returning()

    if (!updated) {
      return conflict(
        "This merchant was changed by someone else — reload and try again.",
      )
    }

    const diff = diffEntity(current, updated, ["status"])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_REACTIVATED",
      entityType: "merchant",
      entityId: updated.id,
      description: `Reactivated merchant ${updated.businessName}`,
      metadata: diff ? { diff } : null,
    })

    refreshStats(statTag("merchant"))

    return NextResponse.json(updated)
  },
)
