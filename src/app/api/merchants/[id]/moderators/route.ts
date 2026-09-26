import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import {
  accountStatus,
  countModeratorSlots,
  issueActivationToken,
  sendActivationEmail,
} from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { auth } from "@/lib/auth"
import { db, dbRead } from "@/lib/db"
import { merchant, profile, user } from "@/lib/db/schema"
import { hasNavPermission, merchantGrantableNavItems } from "@/lib/nav-config"
import { moderatorCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

function invalidGrants(permissions: string[]): string[] {
  const grantable = new Set(merchantGrantableNavItems().map((i) => i.href))
  return permissions.filter((p) => !grantable.has(p))
}

export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const me = await requireSession()
    if (!me) return unauthorized()
    // Owner-only: Business Settings (this surface) is never grantable to a
    // moderator, so hasNavPermission doubles as the moderator exclusion.
    if (
      me.role !== "MERCHANT" ||
      me.merchantId !== id ||
      !hasNavPermission(me, "/merchant/settings")
    ) {
      return forbidden()
    }

    const [merchantRow] = await dbRead
      .select({ maxModerators: merchant.maxModerators })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)
    if (!merchantRow) return notFound()

    const rows = await dbRead
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        isActive: profile.isActive,
        activatedAt: profile.activatedAt,
        permissions: profile.moderatorPermissions,
        createdAt: profile.createdAt,
      })
      .from(profile)
      .innerJoin(user, eq(user.id, profile.userId))
      .where(and(eq(profile.merchantId, id), eq(profile.isModerator, true)))
      .orderBy(asc(profile.createdAt))

    const moderators = rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      status: accountStatus(r),
      permissions: r.permissions ?? [],
      activatedAt: r.activatedAt,
      createdAt: r.createdAt,
    }))

    return NextResponse.json({
      data: moderators,
      total: moderators.length,
      quota: {
        used: await countModeratorSlots(id),
        max: merchantRow.maxModerators,
      },
    })
  },
)

export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const me = await requireSession()
    if (!me) return unauthorized()
    if (
      me.role !== "MERCHANT" ||
      me.merchantId !== id ||
      !hasNavPermission(me, "/merchant/settings")
    ) {
      return forbidden()
    }

    const parsed = await parseBody(req, moderatorCreateSchema)
    if (parsed.error) return parsed.error
    const { name, email, password, permissions } = parsed.data

    const invalid = invalidGrants(permissions)
    if (invalid.length > 0) {
      return badRequest(`Invalid access grants: ${invalid.join(", ")}`)
    }

    const [merchantRow] = await dbRead
      .select({
        maxModerators: merchant.maxModerators,
        businessName: merchant.businessName,
      })
      .from(merchant)
      .where(eq(merchant.id, id))
      .limit(1)
    if (!merchantRow) return notFound()

    // Quota: ACTIVE + PENDING moderators occupy a slot (pending reserves it
    // so no account can exist that could never activate).
    const used = await countModeratorSlots(id)
    if (used >= merchantRow.maxModerators) {
      return NextResponse.json(
        {
          error: `Moderator limit reached (${used}/${merchantRow.maxModerators}). Deactivate a moderator to free a slot.`,
        },
        { status: 403 },
      )
    }

    // Admin-chosen temporary password; the invitee replaces it when they
    // click the activation link. Better Auth hashes it on create.
    let created
    try {
      created = await auth.api.createUser({
        body: { name, email, password, role: "MERCHANT" as "user" },
      })
    } catch (err) {
      console.error("[moderators] createUser failed:", err)
      return badRequest(
        "Could not create the moderator (is the email already in use?)",
      )
    }

    try {
      await db.insert(profile).values({
        userId: created.user.id,
        role: "MERCHANT",
        merchantId: id,
        isActive: false,
        isModerator: true,
        moderatorPermissions: permissions,
      })
      const rawToken = await issueActivationToken(created.user.id)
      await sendActivationEmail({
        to: email,
        userName: name,
        contextName: merchantRow.businessName,
        rawToken,
      })
    } catch (err) {
      console.error("[moderators] activation setup failed:", err)
      try {
        await db.delete(user).where(eq(user.id, created.user.id))
      } catch (cleanupErr) {
        console.error("[moderators] orphan cleanup failed:", cleanupErr)
      }
      return NextResponse.json(
        { error: "Could not finish creating the moderator." },
        { status: 500 },
      )
    }

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MODERATOR_CREATED",
      entityType: "profile",
      entityId: created.user.id,
      description: `Created moderator account for ${name} (${email})`,
      metadata: { merchantId: id, permissions },
    })

    return NextResponse.json(
      {
        userId: created.user.id,
        name: created.user.name,
        email: created.user.email,
        status: "PENDING",
        permissions,
        activatedAt: null,
        createdAt: created.user.createdAt,
      },
      { status: 201 },
    )
  },
)
