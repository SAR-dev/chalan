import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { refreshStats, statTag } from "@/lib/cached-stats"
import { db } from "@/lib/db"
import { profile, user } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const { id } = await params

    const [current] = await db
      .select({ isActive: profile.isActive })
      .from(profile)
      .where(eq(profile.userId, id))
      .limit(1)

    if (!current) return notFound()

    const [updated] = await db
      .update(profile)
      .set({ isActive: !current.isActive })
      // Lost-update guard (ROADMAP R0.9). Without the `isActive` clause two
      // concurrent toggles both read the same value and both write the same
      // result, so one activation silently collapses: the second caller sees
      // "success" while its own change was dropped. Conditioning the write on
      // the state we actually read turns that into an explicit conflict the
      // caller can surface — which use-team's `!res.ok` path already does.
      .where(
        and(eq(profile.userId, id), eq(profile.isActive, current.isActive)),
      )
      .returning()

    if (!updated) {
      return conflict(
        "Account status changed while saving. Reload and try again.",
      )
    }

    const [targetUser] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, id))
      .limit(1)

    const diff = diffEntity(current, updated, ["isActive"])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: updated.isActive
        ? "TEAM_MEMBER_ACTIVATED"
        : "TEAM_MEMBER_DEACTIVATED",
      entityType: "user",
      entityId: id,
      description: `${updated.isActive ? "Activated" : "Deactivated"} account for ${targetUser?.name ?? id}`,
      metadata: diff ? { diff } : null,
    })

    // Activating or deactivating a warehouse admin changes the overview's
    // "warehouse admins" tile.
    refreshStats(statTag("profile"))

    return NextResponse.json(updated)
  },
)
