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
// No pagination — active announcements are expected to be small in number.
// The client is responsible for read/unread state (localStorage).
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

  // Filter server-side by targetRoles since jsonb containment queries differ
  // between postgres and sqlite. This list is small so in-process filtering is fine.
  const forMe = rows.filter((a) =>
    (a.targetRoles as string[]).includes(me.role),
  )

  return NextResponse.json(forMe)
})
