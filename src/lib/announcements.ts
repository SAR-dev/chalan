import { and, eq, isNull, lte, or, type SQL, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { announcement } from "@/lib/db/schema"
import type { Announcement, Role } from "@/lib/types"

// Shared announcement query builder.
//
// The "live + targeted at the caller's role" predicate used to be hand-written
// in three places (the active API route, the dashboard inbox server component,
// and the detail page), each drifting slightly from the others. This module
// is the single definition: whoever needs an announcement for a user calls one
// of these two helpers and gets the same visibility rules, in one query.
//
// "New since you last looked" (the badge) is derived from ONE column —
// `profile.announcementsSeenAt` — not per-item read rows: announcements are
// broadcasts, and per-recipient receipts would rebuild the notification model
// that R4.1 owns. See the tombstone above the removed `announcement_read`
// table for that reasoning.
//
// Like src/lib/db/order-lookup.ts, the runner is injectable so callers inside
// a transaction can read through `tx`.

/** Matches order-lookup.ts: anything with a `select` — db, dbRead, or a tx. */
export type AnnouncementRunner = Pick<typeof db, "select">

/**
 * "Live" = isActive AND publishedAt is set and in the past AND (expiresAt is
 * null OR in the future). Expressly defined once so the API list, the inbox
 * pages, and the detail page can never disagree about what a reader is
 * allowed to see.
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

/** An announcement plus its "new since last visit" flag. */
export type ActiveAnnouncementRow = Announcement & {
  /** Published after the reader's `announcementsSeenAt` — shown with a NEW
   * pill and counted in the badge until they next visit the feed. */
  isNew: boolean
}

function withNewFlag(
  rows: Announcement[],
  seenAt: string | null | undefined,
): ActiveAnnouncementRow[] {
  return rows.map((row) => ({
    ...row,
    isNew:
      row.publishedAt != null && (seenAt == null || row.publishedAt > seenAt),
  }))
}

/**
 * Every announcement currently visible to this user, newest first, each
 * flagged `isNew` against their last feed visit.
 *
 * Bounded by the caller's limit rather than paginated — active announcements
 * are small in number, but the query must still be bounded.
 */
export async function getActiveAnnouncements(
  runner: AnnouncementRunner = db,
  {
    role,
    seenAt,
    limit = 50,
    now = new Date().toISOString(),
  }: {
    role: Role
    /** `profile.announcementsSeenAt`; null/undefined = never visited, so
     * everything live counts as new. */
    seenAt?: string | null
    limit?: number
    now?: string
  },
): Promise<ActiveAnnouncementRow[]> {
  const rows = await runner
    .select()
    .from(announcement)
    .where(and(liveClause(now), targetedAt(role)))
    .orderBy(sql`${announcement.publishedAt} desc`)
    .limit(limit)
  return withNewFlag(rows, seenAt)
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
  { id, role }: { id: string; role: Role },
): Promise<Announcement | null> {
  const [row] = await runner
    .select()
    .from(announcement)
    .where(and(eq(announcement.id, id), targetedAt(role)))
    .limit(1)
  return row ?? null
}
