import { and, eq, inArray, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { getActiveAnnouncements } from "@/lib/announcements"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { announcementRead } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

// Marks every announcement currently live for the caller's role as read —
// the inbox's "Mark all read". Visibility comes from the shared helper, so
// this marks exactly the set the inbox is showing, no more and no less.
//
// Two statements rather than one INSERT … SELECT: the count is the useful
// part of the response (the UI shows "N marked"), and ON CONFLICT DO NOTHING
// swallows duplicates without reporting them. Rows read earlier are left
// untouched, so re-running never moves an existing readAt backwards.
//
// Self-service write — deliberately not audited (see CONTRIBUTING §3.5).
export const POST = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const live = await getActiveAnnouncements(dbRead, {
    userId: me.userId,
    role: me.role,
  })

  if (live.length === 0) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  const ids = live.map((row) => row.id)

  await db
    .insert(announcementRead)
    .values(
      ids.map((announcementId) => ({ announcementId, userId: me.userId })),
    )
    .onConflictDoNothing()

  // Rows already read before this call still count as read — the count means
  // "how many of the visible announcements are now read", not "how many rows
  // this statement inserted".
  const [{ count }] = await dbRead
    .select({ count: sql<number>`count(*)` })
    .from(announcementRead)
    .where(
      and(
        eq(announcementRead.userId, me.userId),
        inArray(announcementRead.announcementId, ids),
      ),
    )

  return NextResponse.json({ ok: true, count: Number(count) })
})
