import { inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAuditMany } from "@/lib/audit"
import { db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const DELETE = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  const existing = await db
    .select({ id: announcement.id, title: announcement.title })
    .from(announcement)
    .where(inArray(announcement.id, ids))

  if (existing.length === 0) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  await db.delete(announcement).where(
    inArray(
      announcement.id,
      existing.map((a) => a.id),
    ),
  )

  await logAuditMany(
    existing.map((a) => ({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ANNOUNCEMENT_DELETED",
      entityType: "announcement",
      entityId: a.id,
      description: `Deleted announcement "${a.title}"`,
    })),
  )

  return NextResponse.json({ ok: true, count: existing.length })
})
