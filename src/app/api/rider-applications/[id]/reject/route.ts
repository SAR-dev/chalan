import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import siteData from "@/config/site.json"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { rider } from "@/lib/db/schema"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import { parseBody, riderApplicationRejectSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const parsed = await parseBody(req, riderApplicationRejectSchema)
    if (parsed.error) return parsed.error
    const { reason } = parsed.data

    const [current] = await db
      .select({ status: rider.status, email: rider.email, name: rider.name })
      .from(rider)
      .where(eq(rider.id, id))
      .limit(1)

    if (!current) return notFound()
    if (current.status !== "PENDING") {
      return badRequest("Only PENDING applications can be rejected")
    }

    // Rider + audit + rejection-email outbox row commit together
    // (ROADMAP P1.4/P1.5).
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(rider)
        .set({
          status: "REJECTED",
          rejectionReason: reason,
          nidRejectedBy: me.name,
          nidRejectedAt: new Date().toISOString(),
        })
        .where(and(eq(rider.id, id), eq(rider.status, "PENDING")))
        .returning()
      if (!row) return null

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "RIDER_REJECTED",
          entityType: "rider",
          entityId: row.id,
          description: `Rejected rider application for ${row.name}: ${reason}`,
        },
        tx,
      )

      await enqueueEmail(
        {
          to: row.email,
          subject: `[${siteData.name}] Update on your rider application`,
          html: `
        <p>Hi ${row.name},</p>
        <p>Thank you for your interest in joining ${siteData.name} as a rider.</p>
        <p>After careful review, we are unable to approve your application at this time.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>If you believe this was a mistake or your circumstances have changed, you are welcome to reapply.</p>
        <p>— The ${siteData.name} Team</p>
      `,
        },
        tx,
      )

      return row
    })

    if (!updated) {
      return badRequest("Only PENDING applications can be rejected")
    }

    // Best-effort immediate delivery; the cron retries anything left behind.
    await flushEmailOutbox()

    return NextResponse.json(updated)
  },
)
