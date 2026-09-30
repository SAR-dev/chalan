import { and, eq, isNull, lte, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

// Returns announcements that are currently live for the caller's role.
// "Live" = isActive AND publishedAt <= now AND (expiresAt IS NULL OR expiresAt > now)
// AND targetRoles contains the caller's role.
//
// Bounded by MAX_ACTIVE_ANNOUNCEMENTS rather than paginated — active
// announcements are small in number, but the query must still be bounded. The
// client is responsible for read/unread state (localStorage).
const MAX_ACTIVE_ANNOUNCEMENTS = 50

export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const now = new Date().toISOString()

  const rows = await db
    .select({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
      isActive: announcement.isActive,
      targetRoles: announcement.targetRoles,
      createdBy: announcement.createdBy,
      createdAt: announcement.createdAt,
    })
    .from(announcement)
    .where(
      and(
        eq(announcement.isActive, true),
        // jsonb containment: targetRoles includes the caller's role. Postgres
        // only (there is no sqlite driver), so this can stay in SQL instead of
        // fetching every live row and filtering in JS.
        sql`${announcement.targetRoles} @> ${JSON.stringify([me.role])}::jsonb`,
        // publishedAt is set and in the past
        and(
          sql`${announcement.publishedAt} is not null`,
          lte(announcement.publishedAt, now),
        ),
        // expiresAt is null OR in the future
        or(
          isNull(announcement.expiresAt),
          sql`${announcement.expiresAt} > ${now}`,
        ),
      ),
    )
    .orderBy(sql`${announcement.publishedAt} desc`)
    .limit(MAX_ACTIVE_ANNOUNCEMENTS)

  return NextResponse.json(rows)
})
