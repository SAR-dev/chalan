import { eq } from "drizzle-orm"
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
import { sendMail } from "@/lib/mailer"
import { parseBody, riderApplicationRejectSchema } from "@/lib/validation"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const [updated] = await db
    .update(rider)
    .set({
      status: "REJECTED",
      rejectionReason: reason,
      nidRejectedBy: me.name,
      nidRejectedAt: new Date().toISOString(),
    })
    .where(eq(rider.id, id))
    .returning()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "RIDER_REJECTED",
    entityType: "rider",
    entityId: updated.id,
    description: `Rejected rider application for ${updated.name}: ${reason}`,
  })

  // Send rejection email (fire-and-forget with retries).
  sendMail(
    {
      to: updated.email,
      subject: `[${siteData.name}] Update on your rider application`,
      html: `
        <p>Hi ${updated.name},</p>
        <p>Thank you for your interest in joining ${siteData.name} as a rider.</p>
        <p>After careful review, we are unable to approve your application at this time.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>If you believe this was a mistake or your circumstances have changed, you are welcome to reapply.</p>
        <p>— The ${siteData.name} Team</p>
      `,
    },
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, err) =>
        console.warn(
          `[mailer] Retry ${attempt} for rider rejection email (${updated.email}):`,
          err.message,
        ),
    },
  ).catch((err) => console.error("[mailer] Rider rejection email failed:", err))

  return NextResponse.json(updated)
}
