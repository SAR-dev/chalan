import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { isUniqueViolation } from "@/lib/db-errors"
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

    // A merchant email change must also update the owner's auth user, or the
    // account can no longer sign in with the new address (ROADMAP P1.4c). The
    // two writes and the audits share one transaction; a duplicate email
    // (`merchant_email_unique` / `user_email_unique`) is a 409, not a 500.
    const newEmail = profileParsed.success
      ? profileParsed.data.email.trim()
      : null

    let updated: typeof merchant.$inferSelect | null
    try {
      updated = await db.transaction(async (tx) => {
        // Only read the previous email when the body actually carries one.
        let previousEmail: string | null = null
        if (newEmail) {
          const [before] = await tx
            .select({ email: merchant.email })
            .from(merchant)
            .where(eq(merchant.id, id))
            .limit(1)
          if (!before) return null
          previousEmail = before.email
        }

        const [row] = await tx
          .update(merchant)
          .set(updates)
          .where(eq(merchant.id, id))
          .returning()

        if (newEmail && newEmail !== previousEmail) {
          const [owner] = await tx
            .select({ userId: profile.userId })
            .from(profile)
            .where(
              and(eq(profile.merchantId, id), eq(profile.role, "MERCHANT")),
            )
            .limit(1)
          if (owner) {
            await tx
              .update(user)
              .set({ email: newEmail, updatedAt: new Date().toISOString() })
              .where(eq(user.id, owner.userId))
          }
        }

        // Moderator quota is admin-only and always audited (ROADMAP 5.2).
        if (quotaParsed.success) {
          await logAudit(
            {
              actor: { userId: me.userId, name: me.name, role: me.role },
              action: "MODERATOR_QUOTA_CHANGED",
              entityType: "merchant",
              entityId: row.id,
              description: `Set moderator quota for ${row.businessName} to ${updates.maxModerators}`,
              metadata: { maxModerators: updates.maxModerators },
            },
            tx,
          )
        }

        // Only admins editing a merchant they don't own need an audit trail.
        if (me.role !== "MERCHANT" && profileParsed.success) {
          await logAudit(
            {
              actor: { userId: me.userId, name: me.name, role: me.role },
              action: "MERCHANT_UPDATED",
              entityType: "merchant",
              entityId: row.id,
              description: `Updated merchant ${row.businessName}`,
              metadata: updates,
            },
            tx,
          )
        }

        return row
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        return conflict("That email is already in use.")
      }
      throw err
    }

    if (!updated) return notFound()

    return NextResponse.json(updated)
  },
)
