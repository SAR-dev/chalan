import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import siteData from "@/config/site.json"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { profile, rider } from "@/lib/db/schema"
import { sendMail } from "@/lib/mailer"
import { parseBody, riderApproveSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const parsed = await parseBody(req, riderApproveSchema)
  if (parsed.error) return parsed.error
  const { taskType, warehouseId } = parsed.data

  const { id } = await params

  const [current] = await db
    .select({ status: rider.status, email: rider.email, name: rider.name })
    .from(rider)
    .where(eq(rider.id, id))
    .limit(1)

  if (!current) return notFound()
  if (current.status !== "PENDING") {
    return badRequest("Only PENDING applications can be approved")
  }

  const now = new Date().toISOString()
  const [updated] = await db
    .update(rider)
    .set({
      status: "ACTIVE",
      isActive: true,
      taskType,
      ...(warehouseId ? { warehouseId } : {}),
      approvedBy: me.name,
      approvedAt: now,
    })
    .where(eq(rider.id, id))
    .returning()

  // Activate the profile so the rider can log in.
  await db
    .update(profile)
    .set({ isActive: true })
    .where(eq(profile.riderId, id))

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "RIDER_APPROVED",
    entityType: "rider",
    entityId: updated.id,
    description: `Approved rider application for ${updated.name}`,
  })

  // Send approval email (fire-and-forget with retries).
  sendMail(
    {
      to: updated.email,
      subject: `[${siteData.name}] Your rider application has been approved`,
      html: `
        <p>Hi ${updated.name},</p>
        <p>Great news! Your application to join ${siteData.name} as a rider has been <strong>approved</strong>.</p>
        <p>Your account is now active. You can log in and start accepting deliveries.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}">Log in to ${siteData.name}</a>
        <p>— The ${siteData.name} Team</p>
      `,
    },
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, err) =>
        console.warn(
          `[mailer] Retry ${attempt} for rider approval email (${updated.email}):`,
          err.message,
        ),
    },
  ).catch((err) => console.error("[mailer] Rider approval email failed:", err))

  return NextResponse.json(updated)
})

