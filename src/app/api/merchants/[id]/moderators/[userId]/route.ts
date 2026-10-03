import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import {
  accountStatus,
  lockModeratorQuota,
  ModeratorQuotaError,
} from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { profile } from "@/lib/db/schema"
import { hasNavPermission, merchantGrantableNavItems } from "@/lib/nav-config"
import { moderatorUpdateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (
    req: Request,
    { params }: { params: Promise<{ id: string; userId: string }> },
  ) => {
    const { id, userId } = await params
    const me = await requireSession()
    if (!me) return unauthorized()
    if (
      me.role !== "MERCHANT" ||
      me.merchantId !== id ||
      !hasNavPermission(me, "/merchant/settings")
    ) {
      return forbidden()
    }

    const parsed = await parseBody(req, moderatorUpdateSchema)
    if (parsed.error) return parsed.error
    const { permissions, isActive } = parsed.data

    const updates: {
      moderatorPermissions?: string[]
      isActive?: boolean
    } = {}

    if (permissions !== undefined) {
      const grantable = new Set(merchantGrantableNavItems().map((i) => i.href))
      const invalid = permissions.filter((p) => !grantable.has(p))
      if (invalid.length > 0) {
        return badRequest(`Invalid access grants: ${invalid.join(", ")}`)
      }
      updates.moderatorPermissions = permissions
    }

    if (permissions === undefined && isActive === undefined) {
      return badRequest("No changes to save")
    }

    // Everything below happens in one transaction: the target read, the quota
    // re-check (under a row lock) and the conditional update. Two admins
    // re-activating the last free slot concurrently used to both pass the
    // Count-then-write check.
    const outcome = await db.transaction(async (tx) => {
      const selectTarget = () =>
        tx
          .select({
            userId: profile.userId,
            isActive: profile.isActive,
            activatedAt: profile.activatedAt,
            permissions: profile.moderatorPermissions,
          })
          .from(profile)
          .where(
            and(
              eq(profile.userId, userId),
              eq(profile.merchantId, id),
              eq(profile.isModerator, true),
            ),
          )
          .limit(1)

      const [target] = await selectTarget()
      if (!target) return { kind: "not_found" as const }

      const set = { ...updates }
      if (isActive !== undefined && isActive !== target.isActive) {
        if (isActive) {
          // Only an already-activated account can be re-enabled — a PENDING
          // invite must go through its activation link.
          if (!target.activatedAt) return { kind: "not_activated" as const }
          // Re-activation consumes a slot again (others only — this row is
          // currently DEACTIVATED and doesn't count).
          try {
            const quota = await lockModeratorQuota(tx, id, userId)
            if (!quota) return { kind: "not_found" as const }
          } catch (err) {
            if (err instanceof ModeratorQuotaError) {
              return { kind: "quota" as const, used: err.used, max: err.max }
            }
            throw err
          }
        }
        set.isActive = isActive
      }

      // `isActive` alone can still be a no-op if the row already holds that
      // value; the conditional update below would be a silent no-op audit.
      if (Object.keys(set).length === 0) {
        return { kind: "no_change" as const }
      }

      // Predicate on the state we validated against, so a concurrent change
      // cannot slip past the checks above.
      const [updated] = await tx
        .update(profile)
        .set(set)
        .where(
          and(
            eq(profile.userId, userId),
            eq(profile.merchantId, id),
            eq(profile.isModerator, true),
            eq(profile.isActive, target.isActive),
          ),
        )
        .returning()
      if (!updated) return { kind: "conflict" as const }

      const diff: Record<string, unknown> = {}
      if (permissions !== undefined) {
        diff.permissions = { from: target.permissions ?? [], to: permissions }
      }
      if (set.isActive !== undefined) {
        diff.isActive = { from: target.isActive, to: set.isActive }
      }

      await logAudit(
        {
          actor: { userId: me.userId, name: me.name, role: me.role },
          action: "MODERATOR_UPDATED",
          entityType: "profile",
          entityId: userId,
          description:
            set.isActive === false
              ? `Deactivated moderator ${userId}`
              : `Updated moderator ${userId}`,
          metadata: { merchantId: id, diff },
        },
        tx,
      )

      return { kind: "updated" as const, updated }
    })

    if (outcome.kind === "no_change") return badRequest("No changes to save")
    if (outcome.kind === "not_found") return notFound("Moderator not found")
    if (outcome.kind === "not_activated") {
      return badRequest(
        "Not activated yet — resend the activation link instead.",
      )
    }
    if (outcome.kind === "quota") {
      return NextResponse.json(
        {
          error: `Moderator limit reached (${outcome.used}/${outcome.max}). Deactivate another moderator to free a slot.`,
        },
        { status: 403 },
      )
    }
    if (outcome.kind === "conflict") {
      return conflict(
        "This moderator changed while you were editing — reload and try again.",
      )
    }

    return NextResponse.json({
      userId,
      status: accountStatus(outcome.updated),
      isActive: outcome.updated.isActive,
      permissions: outcome.updated.moderatorPermissions ?? [],
    })
  },
)
