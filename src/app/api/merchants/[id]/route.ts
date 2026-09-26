import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { hasNavPermission } from "@/lib/nav-config"
import {
  merchantBrandingSchema,
  merchantModeratorQuotaSchema,
  merchantProfileSchema,
  parseBody,
} from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
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
        maxModerators: merchant.maxModerators,
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
  },
)

// Update a merchant's own business details or branding. A merchant may only
// edit their own business; Admins / Super Admins may edit any merchant.
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id } = await params

    const isOwner = me.role === "MERCHANT" && me.merchantId === id
    const isAdmin = me.role === "SUPER_ADMIN"
    if (!isOwner && !isAdmin) {
      return forbidden()
    }

    // Sensitive surface (settings/branding): moderators never pass —
    // Business Settings is not a grantable nav section (ROADMAP 5.2).
    if (isOwner && !hasNavPermission(me, "/merchant/settings")) {
      return forbidden("Business settings are owner-only.")
    }

    // Try profile schema first (businessName, email, phone, address), then
    // branding, then the admin-managed moderator quota.
    const { data: body, error: bodyError } = await parseBody(
      req,
      // Quota FIRST: branding is all-optional and would otherwise match a
      // quota-only body first, stripping maxModerators from the parsed data.
      merchantModeratorQuotaSchema
        .or(merchantProfileSchema)
        .or(merchantBrandingSchema),
    )
    if (bodyError) return bodyError

    const profileParsed = merchantProfileSchema.safeParse(body)
    const brandingParsed = merchantBrandingSchema.safeParse(body)
    const quotaParsed = merchantModeratorQuotaSchema.safeParse(body)
    if (quotaParsed.success && !isAdmin) {
      return forbidden("Only administrators can change the moderator quota.")
    }

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

    if (quotaParsed.success) {
      updates.maxModerators = quotaParsed.data.maxModerators
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

    // Moderator quota is admin-only and always audited (ROADMAP 5.2).
    if (quotaParsed.success) {
      await logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "MODERATOR_QUOTA_CHANGED",
        entityType: "merchant",
        entityId: updated.id,
        description: `Set moderator quota for ${updated.businessName} to ${updates.maxModerators}`,
        metadata: { maxModerators: updates.maxModerators },
      })
    }

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
  },
)
