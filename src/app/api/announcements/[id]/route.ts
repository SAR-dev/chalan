import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { announcementUpdateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const parsed = await parseBody(req, announcementUpdateSchema)
    if (parsed.error) return parsed.error

    const { title, content, publishedAt, expiresAt, isActive, targetRoles } =
      parsed.data

    const updates: Partial<{
      title: string
      content: string
      publishedAt: string | null
      expiresAt: string | null
      isActive: boolean
      targetRoles: string[]
      updatedAt: string
    }> = { updatedAt: new Date().toISOString() }

    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (publishedAt !== undefined) updates.publishedAt = publishedAt ?? null
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ?? null
    if (isActive !== undefined) updates.isActive = isActive
    if (targetRoles !== undefined) updates.targetRoles = targetRoles

    const [updated] = await db
      .update(announcement)
      .set(updates)
      .where(eq(announcement.id, id))
      .returning()

    if (!updated) return notFound()

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ANNOUNCEMENT_UPDATED",
      entityType: "announcement",
      entityId: updated.id,
      description: `Updated announcement "${updated.title}"`,
      metadata: updates,
    })

    return NextResponse.json(updated)
  },
)

export const DELETE = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    const [existing] = await db
      .select({ title: announcement.title })
      .from(announcement)
      .where(eq(announcement.id, id))
      .limit(1)

    if (!existing) return notFound()

    await db.delete(announcement).where(eq(announcement.id, id))

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ANNOUNCEMENT_DELETED",
      entityType: "announcement",
      entityId: id,
      description: `Deleted announcement "${existing.title}"`,
    })

    return NextResponse.json({ ok: true })
  },
)
