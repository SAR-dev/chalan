import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantApprovedTemplate } from "@/lib/mail-templates"
import { sendMail } from "@/lib/mailer"

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const [updated] = await db
    .update(merchant)
    .set({
      status: "ACTIVE",
      approvedBy: me.name,
      approvedAt: new Date().toISOString(),
    })
    .where(eq(merchant.id, id))
    .returning()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "MERCHANT_APPROVED",
    entityType: "merchant",
    entityId: updated.id,
    description: `Approved merchant ${updated.businessName}`,
  })

  const template = await merchantApprovedTemplate({
    ownerName: updated.ownerName,
    businessName: updated.businessName,
  })

  sendMail(
    {
      to: updated.email,
      ...template,
    },
    {
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (attempt, err) =>
        console.warn(
          `[mailer] Retry ${attempt} for merchant approval email (${updated.email}):`,
          err.message,
        ),
    },
  ).catch((err) =>
    console.error("[mailer] Merchant approval email failed:", err),
  )

  return NextResponse.json(updated)
}
