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
import { profile, rider } from "@/lib/db/schema"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import { parseBody, riderApproveSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const parsed = await parseBody(req, riderApproveSchema)
    if (parsed.error) return parsed.error
    const { taskType, warehouseId, vehicleType, vehiclePlate } = parsed.data

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
    // Rider + profile + audit + approval-email outbox row commit together
    // (ROADMAP P1.4/P1.5).
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(rider)
        .set({
          status: "ACTIVE",
          isActive: true,
          taskType,
          ...(warehouseId ? { warehouseId } : {}),
          // The vehicle is recorded at approval, and an explicit `null` from the
          // form is written as a real "not declared" rather than skipped — the
          // approve form is the only moment the admin is asked, so a value that
          // is not sent means they were never shown the question.
          ...(vehicleType !== undefined ? { vehicleType } : {}),
          ...(vehiclePlate !== undefined ? { vehiclePlate } : {}),
          approvedBy: me.name,
          approvedAt: now,
        })
        .where(and(eq(rider.id, id), eq(rider.status, "PENDING")))
        .returning()
      if (!row) return null

      // Activate the profile so the rider can log in.
      await tx
        .update(profile)
        .set({ isActive: true })
        .where(eq(profile.riderId, id))

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "RIDER_APPROVED",
          entityType: "rider",
          entityId: row.id,
          description: `Approved rider application for ${row.name}`,
        },
        tx,
      )

      await enqueueEmail(
        {
          to: row.email,
          subject: `[${siteData.name}] Your rider application has been approved`,
          html: `
        <p>Hi ${row.name},</p>
        <p>Great news! Your application to join ${siteData.name} as a rider has been <strong>approved</strong>.</p>
        <p>Your account is now active. You can log in and start accepting deliveries.</p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}">Log in to ${siteData.name}</a>
        <p>— The ${siteData.name} Team</p>
      `,
        },
        tx,
      )

      return row
    })

    if (!updated) {
      return badRequest("Only PENDING applications can be approved")
    }

    // Best-effort immediate delivery; the cron retries anything left behind.
    await flushEmailOutbox()

    return NextResponse.json(updated)
  },
)
