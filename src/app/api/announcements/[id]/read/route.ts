import { and, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { notFound, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { announcement, announcementRead } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

// Marks one announcement as read for the caller.
//
// Self-service (a user marking their own reads), so no logAudit() — the audit
// trail tracks privileged actions, not every write in the system. The unique
// index on (announcementId, userId) plus ON CONFLICT DO NOTHING makes this
// idempotent: two tabs marking the same row at once both succeed and write
// one row. `readAt` is server-generated (defaultNow) — the client has no say
// in the timestamp.
export const POST = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id } = await params

    // Role targeting is enforced server-side: guessing an id must not let a
    // user mark — and therefore read — an announcement aimed at another role.
    const [existing] = await db
      .select({ id: announcement.id })
      .from(announcement)
      .where(
        and(
          eq(announcement.id, id),
          sql`${announcement.targetRoles} @> ${JSON.stringify([me.role])}::jsonb`,
        ),
      )
      .limit(1)

    if (!existing) return notFound()

    await db
      .insert(announcementRead)
      .values({ announcementId: id, userId: me.userId })
      .onConflictDoNothing()

    return NextResponse.json({ ok: true })
  },
)
