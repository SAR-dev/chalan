import { and, eq, isNull, lte, or, type SQL, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement, announcementRead } from "@/lib/db/schema"
import type { Announcement, Role } from "@/lib/types"

// Shared announcement query builder.
//
// The "live + targeted at the caller's role" predicate used to be hand-written
// in three places (the active API route, the dashboard inbox server component,
// and now the detail page), each drifting slightly from the others. This module
// is the single definition: whoever needs an announcement for a user calls one
// of these two helpers and gets the same visibility rules plus the per-user
// read state, in one query.
//
// Like src/lib/db/order-lookup.ts, the runner is injectable so callers inside
// a transaction can read through `tx`.

/** Matches order-lookup.ts: anything with a `select` — db, dbRead, or a tx. */
export type AnnouncementRunner = Pick<typeof db, "select">

/**
 * "Live" = isActive AND publishedAt is set and in the past AND (expiresAt is
 * null OR in the future). Expressed once so the API list, the inbox pages, and
 * the detail page can never disagree about what a reader is allowed to see.
 */
function liveClause(now: string): SQL {
  return and(
    eq(announcement.isActive, true),
    sql`${announcement.publishedAt} is not null`,
    lte(announcement.publishedAt, now),
    or(isNull(announcement.expiresAt), sql`${announcement.expiresAt} > ${now}`),
  )!
}

/** targetRoles is a jsonb array of Role strings — containment, not equality. */
function targetedAt(role: Role): SQL {
  return sql`${announcement.targetRoles} @> ${JSON.stringify([role])}::jsonb`
}

/** A row as returned by these helpers: an announcement plus its read state. */
export type AnnouncementWithRead = Announcement & {
  /** When the caller read it, or null when still unread. */
  readAt: string | null
}

const listColumns = {
  id: announcement.id,
  title: announcement.title,
  content: announcement.content,
  publishedAt: announcement.publishedAt,
  expiresAt: announcement.expiresAt,
  isActive: announcement.isActive,
  targetRoles: announcement.targetRoles,
  createdBy: announcement.createdBy,
  createdAt: announcement.createdAt,
  updatedAt: announcement.updatedAt,
  readAt: sql<string | null>`${announcementRead.readAt}`,
}

/**
 * Every announcement currently visible to this user, newest first, each with
 * its read state. LEFT JOINed (not INNER) so unread rows come back with
 * `readAt = null` rather than disappearing from the list.
 *
 * Bounded by the caller's limit rather than paginated — active announcements
 * are small in number, but the query must still be bounded.
 */
export async function getActiveAnnouncements(
  runner: AnnouncementRunner = db,
  {
    userId,
    role,
    limit = 50,
    now = new Date().toISOString(),
  }: {
    userId: string
    role: Role
    limit?: number
    now?: string
  },
): Promise<AnnouncementWithRead[]> {
  return runner
    .select(listColumns)
    .from(announcement)
    .leftJoin(
      announcementRead,
      and(
        eq(announcementRead.announcementId, announcement.id),
        eq(announcementRead.userId, userId),
      ),
    )
    .where(and(liveClause(now), targetedAt(role)))
    .orderBy(sql`${announcement.publishedAt} desc`)
    .limit(limit)
}

/**
 * One announcement for one user — the detail-page lookup. Returns null when
 * the announcement is missing OR not targeted at the caller's role; callers
 * turn that into `notFound()` so a role can never read another role's notice
 * by guessing an id.
 *
 * Deliberately does NOT filter on the live window: a link to an expired or
 * deactivated announcement keeps working as read-only history (it was visible
 * when it was sent). Staleness is the caller's display concern.
 */
export async function getAnnouncementForUser(
  runner: AnnouncementRunner = db,
  {
    id,
    userId,
    role,
  }: {
    id: string
    userId: string
    role: Role
  },
): Promise<AnnouncementWithRead | null> {
  const [row] = await runner
    .select(listColumns)
    .from(announcement)
    .leftJoin(
      announcementRead,
      and(
        eq(announcementRead.announcementId, announcement.id),
        eq(announcementRead.userId, userId),
      ),
    )
    .where(and(eq(announcement.id, id), targetedAt(role)))
    .limit(1)
  return row ?? null
}
