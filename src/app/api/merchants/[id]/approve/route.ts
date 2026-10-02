import { and, eq } from "drizzle-orm"
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
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import { merchantApprovedTemplate } from "@/lib/mail-templates"
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
      .select({
        status: merchant.status,
        emailVerifiedAt: merchant.emailVerifiedAt,
        approvedBy: merchant.approvedBy,
        approvedAt: merchant.approvedAt,
      })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)

    if (!current) return notFound()
    if (current.status !== "PENDING") {
      return badRequest("Only PENDING merchants can be approved")
    }
    if (!current.emailVerifiedAt) {
      return badRequest("Merchant must verify their email before approval")
    }

    // The status flip, audit row and approval email outbox row commit
    // Together.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(merchant)
        .set({
          status: "ACTIVE",
          approvedBy: me.name,
          approvedAt: new Date().toISOString(),
        })
        .where(and(eq(merchant.id, id), eq(merchant.status, "PENDING")))
        .returning()

      if (!row) return null

      const diff = diffEntity(current, row, [
        "status",
        "approvedBy",
        "approvedAt",
      ])

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "MERCHANT_APPROVED",
          entityType: "merchant",
          entityId: row.id,
          description: `Approved merchant ${row.businessName}`,
          metadata: diff ? { diff } : null,
        },
        tx,
      )

      const template = await merchantApprovedTemplate({
        ownerName: row.ownerName,
        businessName: row.businessName,
      })
      await enqueueEmail({ to: row.email, ...template }, tx)

      return row
    })

    if (!updated) {
      return conflict(
        "This merchant was changed by someone else — reload and try again.",
      )
    }

    // Best-effort immediate delivery; the cron retries anything left behind.
    await flushEmailOutbox()

    // Clears the overview's "pending merchants" tile and the merchants tab
    // Counters immediately; the 30s TTL is only the backstop.
    refreshStats(statTag("merchant"))

    return NextResponse.json(updated)
  },
)
