import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
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
      .where(eq(profile.userId, id))
      .returning()

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

    return NextResponse.json(updated)
  },
)
