import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantProfileSchema, parseBody } from "@/lib/validation"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { id } = await params

  const isOwner = me.role === "MERCHANT" && me.merchantId === id
  const isAdmin = me.role === "SUPER_ADMIN"
  if (!isOwner && !isAdmin) {
    return forbidden()
  }

  const [found] = await dbRead
    .select({
      id: merchant.id,
      businessName: merchant.businessName,
      ownerName: merchant.ownerName,
      email: merchant.email,
      phone: merchant.phone,
      address: merchant.address,
      status: merchant.status,
      businessType: merchant.businessType,
      onboardingCompletedAt: merchant.onboardingCompletedAt,
      emailVerifiedAt: merchant.emailVerifiedAt,
      phoneVerifiedAt: merchant.phoneVerifiedAt,
      baseRate: merchant.baseRate,
      extraRatePerKg: merchant.extraRatePerKg,
      freeWeightKg: merchant.freeWeightKg,
      maxWeightKg: merchant.maxWeightKg,
      codFeePercentage: merchant.codFeePercentage,
      nidSubmittedAt: merchant.nidSubmittedAt,
      nidVerifiedAt: merchant.nidVerifiedAt,
      nidVerifiedBy: merchant.nidVerifiedBy,
      nidRejectedAt: merchant.nidRejectedAt,
      nidRejectedBy: merchant.nidRejectedBy,
      nidRejectionReason: merchant.nidRejectionReason,
      nidNumber: merchant.nidNumber,
      nidFrontImage: merchant.nidFrontImage,
      nidBackImage: merchant.nidBackImage,
      nidSelfieImage: merchant.nidSelfieImage,
      approvedBy: merchant.approvedBy,
      approvedAt: merchant.approvedAt,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    })
    .from(merchant)
    .where(eq(merchant.id, id))
    .limit(1)

  if (!found) return notFound()

  return NextResponse.json(found)
}

// Update a merchant's own business contact details (name, email, phone,
// address). A merchant may only edit their own business; Admins / Super Admins
// may edit any merchant. Pricing and status are handled by dedicated routes.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { id } = await params

  const isOwner = me.role === "MERCHANT" && me.merchantId === id
  const isAdmin = me.role === "SUPER_ADMIN"
  if (!isOwner && !isAdmin) {
    return forbidden()
  }

  const parsed = await parseBody(req, merchantProfileSchema)
  if (parsed.error) return parsed.error
  const { businessName, email, phone, address } = parsed.data

  const [updated] = await db
    .update(merchant)
    .set({
      businessName: businessName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
    })
    .where(eq(merchant.id, id))
    .returning()

  if (!updated) return notFound()

  // Only admins editing a merchant they don't own need an audit trail.
  if (me.role !== "MERCHANT") {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_UPDATED",
      entityType: "merchant",
      entityId: updated.id,
      description: `Updated merchant ${updated.businessName}`,
      metadata: { businessName, email, phone, address },
    })
  }

  return NextResponse.json(updated)
}
