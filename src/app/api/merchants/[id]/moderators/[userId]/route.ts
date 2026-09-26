import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { accountStatus, countModeratorSlots } from "@/lib/activation"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { merchant, profile } from "@/lib/db/schema"
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

    const [target] = await dbRead
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
    if (!target) return notFound("Moderator not found")

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

    if (isActive !== undefined && isActive !== target.isActive) {
      if (isActive) {
        // Only an already-activated account can be re-enabled — a PENDING
        // invite must go through its activation link.
        if (!target.activatedAt) {
          return badRequest(
            "Not activated yet — resend the activation link instead.",
          )
        }
        const [merchantRow] = await dbRead
          .select({ maxModerators: merchant.maxModerators })
          .from(merchant)
          .where(eq(merchant.id, id))
          .limit(1)
        if (!merchantRow) return notFound()
        // Re-activation consumes a slot again (others only — this row is
        // currently DEACTIVATED and doesn't count).
        const used = await countModeratorSlots(id, userId)
        if (used >= merchantRow.maxModerators) {
          return NextResponse.json(
            {
              error: `Moderator limit reached (${used}/${merchantRow.maxModerators}). Deactivate another moderator to free a slot.`,
            },
            { status: 403 },
          )
        }
        updates.isActive = true
      } else {
        updates.isActive = false
      }
    }

    if (Object.keys(updates).length === 0) {
      return badRequest("No changes to save")
    }

    const [updated] = await db
      .update(profile)
      .set(updates)
      .where(eq(profile.userId, userId))
      .returning()
    if (!updated) return notFound()

    const diff: Record<string, unknown> = {}
    if (permissions !== undefined) {
      diff.permissions = { from: target.permissions ?? [], to: permissions }
    }
    if (updates.isActive !== undefined) {
      diff.isActive = { from: target.isActive, to: updates.isActive }
    }

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "MODERATOR_UPDATED",
      entityType: "profile",
      entityId: userId,
      description:
        updates.isActive === false
          ? `Deactivated moderator ${userId}`
          : `Updated moderator ${userId}`,
      metadata: { merchantId: id, diff },
    })

    return NextResponse.json({
      userId,
      status: accountStatus(updated),
      isActive: updated.isActive,
      permissions: updated.moderatorPermissions ?? [],
    })
  },
)
