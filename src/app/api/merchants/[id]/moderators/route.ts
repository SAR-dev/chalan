import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import {
  accountStatus,
  countModeratorSlots,
  issueActivationToken,
  lockModeratorQuota,
  ModeratorQuotaError,
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
import { flushEmailOutbox } from "@/lib/email-outbox"
import { logger } from "@/lib/logger"
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

    // Admin-chosen temporary password; the invitee replaces it when they
    // click the activation link. Better Auth hashes it on create.
    //
    // The auth user must exist before the transaction (Better Auth owns its own
    // connection), so the quota is claimed AFTER it — inside the same tx as the
    // profile insert, under a row lock. A full quota therefore leaves a user
    // row to clean up rather than an orphan moderator.
    let created
    try {
      created = await auth.api.createUser({
        body: { name, email, password, role: "MERCHANT" as "user" },
      })
    } catch (err) {
      logger.error("createUser failed", { err })
      return badRequest(
        "Could not create the moderator (is the email already in use?)",
      )
    }

    const cleanupUser = async (reason: string) => {
      try {
        await db.delete(user).where(eq(user.id, created.user.id))
      } catch (cleanupErr) {
        logger.error("Orphan cleanup failed", { reason, err: cleanupErr })
      }
    }

    let outcome:
      | { kind: "created"; businessName: string }
      | { kind: "quota"; used: number; max: number }
      | { kind: "not_found" }

    try {
      outcome = await db.transaction(async (tx) => {
        // Quota: ACTIVE + PENDING moderators occupy a slot (pending reserves
        // it so no account can exist that could never activate). Locked, so
        // two concurrent invites can't both claim the last slot.
        let businessName: string
        try {
          const quota = await lockModeratorQuota(tx, id)
          if (!quota) return { kind: "not_found" as const }
          const [row] = await tx
            .select({ businessName: merchant.businessName })
            .from(merchant)
            .where(eq(merchant.id, id))
            .limit(1)
          businessName = row?.businessName ?? ""
        } catch (err) {
          if (err instanceof ModeratorQuotaError) {
            return { kind: "quota" as const, used: err.used, max: err.max }
          }
          throw err
        }

        await tx.insert(profile).values({
          userId: created.user.id,
          role: "MERCHANT",
          merchantId: id,
          isActive: false,
          isModerator: true,
          moderatorPermissions: permissions,
        })
        const rawToken = await issueActivationToken(created.user.id, tx)
        // Enqueue the invite email in the same transaction (ROADMAP P1.5), so
        // the account and its email commit together.
        await sendActivationEmail(
          {
            to: email,
            userName: name,
            contextName: businessName,
            rawToken,
          },
          tx,
        )
        // Audit inside the tx: a crash can no longer lose the trail
        // (ROADMAP P1.4).
        await logAudit(
          {
            actor: { userId: me.userId, name: me.name, role: me.role },
            action: "MODERATOR_CREATED",
            entityType: "profile",
            entityId: created.user.id,
            description: `Created moderator account for ${name} (${email})`,
            metadata: { merchantId: id, permissions },
          },
          tx,
        )
        return { kind: "created" as const, businessName }
      })
    } catch (err) {
      logger.error("activation setup failed", { err })
      await cleanupUser("transaction failure")
      return NextResponse.json(
        { error: "Could not finish creating the moderator." },
        { status: 500 },
      )
    }

    if (outcome.kind === "not_found") {
      await cleanupUser("merchant vanished")
      return notFound()
    }
    if (outcome.kind === "quota") {
      await cleanupUser("quota full")
      return NextResponse.json(
        {
          error: `Moderator limit reached (${outcome.used}/${outcome.max}). Deactivate a moderator to free a slot.`,
        },
        { status: 403 },
      )
    }

    // Best-effort immediate delivery; the cron retries anything left behind.
    await flushEmailOutbox()

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
