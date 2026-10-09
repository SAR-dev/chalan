import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { refreshStats, statTag } from "@/lib/cached-stats"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import { merchantApprovedTemplate } from "@/lib/mail-templates"
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
    .select({ id: merchant.id })
    .from(merchant)
    .where(
      and(
        inArray(merchant.id, ids),
        eq(merchant.status, "PENDING"),
        isNotNull(merchant.emailVerifiedAt),
      ),
    )

  if (pendings.length === 0) {
    return badRequest(
      "No PENDING merchants with verified email found for the given IDs.",
    )
  }

  const approved: {
    id: string
    businessName: string
    status: string
    approvedBy: string | null
    approvedAt: string | null
  }[] = []

  for (const { id } of pendings) {
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

      const diff = diffEntity(
        { status: "PENDING", approvedBy: null, approvedAt: null },
        row,
        ["status", "approvedBy", "approvedAt"],
      )

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

    if (updated) {
      approved.push(updated)
    }
  }

  if (approved.length === 0) {
    return badRequest("No merchants could be approved.")
  }

  // Best-effort immediate delivery; the cron retries anything left behind.
  await flushEmailOutbox()

  refreshStats(statTag("merchant"))

  return NextResponse.json({ ok: true, count: approved.length })
})
