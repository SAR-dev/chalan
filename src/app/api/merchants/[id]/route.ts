import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { merchantBrandingSchema, merchantProfileSchema } from "@/lib/validation"

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
      logoUrl: merchant.logoUrl,
      brandColor: merchant.brandColor,
      hidePlatformBranding: merchant.hidePlatformBranding,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    })
    .from(merchant)
    .where(eq(merchant.id, id))
    .limit(1)

  if (!found) return notFound()

  return NextResponse.json(found)
}

// Update a merchant's own business details or branding. A merchant may only
// edit their own business; Admins / Super Admins may edit any merchant.
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

  // Try profile schema first (businessName, email, phone, address), then branding schema.
  const body = await req.json()
  const profileParsed = merchantProfileSchema.safeParse(body)
  const brandingParsed = merchantBrandingSchema.safeParse(body)

  const updates: Record<string, unknown> = {}

  if (profileParsed.success) {
    const { businessName, email, phone, address } = profileParsed.data
    updates.businessName = businessName.trim()
    updates.email = email.trim()
    updates.phone = phone.trim()
    updates.address = address.trim()
  }

  if (brandingParsed.success) {
    const { logoUrl, brandColor, hidePlatformBranding } = brandingParsed.data
    if (logoUrl !== undefined) updates.logoUrl = logoUrl
    if (brandColor !== undefined) updates.brandColor = brandColor
    if (hidePlatformBranding !== undefined)
      updates.hidePlatformBranding = hidePlatformBranding
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    )
  }

  const [updated] = await db
    .update(merchant)
    .set(updates)
    .where(eq(merchant.id, id))
    .returning()

  if (!updated) return notFound()

  // Only admins editing a merchant they don't own need an audit trail.
  if (me.role !== "MERCHANT" && profileParsed.success) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MERCHANT_UPDATED",
      entityType: "merchant",
      entityId: updated.id,
      description: `Updated merchant ${updated.businessName}`,
      metadata: updates,
    })
  }

  return NextResponse.json(updated)
}
