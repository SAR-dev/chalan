import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db, dbRead } from "@/lib/db"
import { notification, profile } from "@/lib/db/schema"
// Pure, and client-safe — `useNotificationFeed` renders the grouped list, and
// importing it from here would drag `@/lib/db` into the browser bundle.
import {
  groupNotifications,
  type NotificationGroup,
} from "@/lib/notification-group"
// From the leaf vocabulary module, not `order-events` — that module imports this
// one, and routing the pure helpers through the cycle loses `isOrderEvent`'s
// type predicate.
import {
  isOrderEvent,
  notificationHrefForEvent,
  notificationTitleForEvent,
  type OrderEvent,
} from "@/lib/order-event"
import type { WebhookTx } from "@/lib/webhooks"

export { groupNotifications, type NotificationGroup }

// =============================================================================
// In-app notifications — the write sink and the read predicates.
//
// Deliberately parallel to src/lib/announcements.ts: "new" is one watermark on
// the profile, compared the same way everywhere, rather than a read receipt per
// row. The list computes its own unread count from the rows it returns, so a
// badge and the list under it cannot disagree about the same moment.
//
// The two features sit beside each other and neither replaces the other:
// announcements are a broadcast board everyone reads, notifications are
// addressed messages about one order.
// =============================================================================

type Reader = Pick<typeof db, "select" | "update">

/**
 * Write one notification per recipient.
 *
 * Runs inside the caller's transaction so a row can never describe a state
 * change that rolled back, and wrapped so a failure here can never fail the
 * transition that raised the event — the same posture `emitWebhookEvent` takes,
 * and for the same reason: a missed in-app row is recoverable, a failed
 * delivery is not.
 */
export async function emitNotificationEvent({
  tx,
  event,
  orderId,
  merchantId,
  actorName,
  now,
  subject,
  recipients: preResolved,
}: {
  tx: WebhookTx
  event: OrderEvent
  orderId: string | null
  merchantId: string
  actorName: string | null
  now: string
  /**
   * "Notify Recipient → Barisal", snapshotted now.
   *
   * Denormalised because `orderId` has no foreign key: a notification outlives
   * its order, so without this the row has nothing left to identify the parcel
   * it was about. Rows written before the column existed fall back to the bare
   * order code in the UI.
   */
  subject?: string | null
  /**
   * Recipients already looked up by the caller.
   *
   * A batch that transitions many orders for one merchant would otherwise pay a
   * recipient SELECT per order — the exact per-row-query growth the batch-cost
   * guards in `transitions.spec.ts` exist to prevent. Hoisting the lookup to
   * once per distinct merchant keeps the cost tied to distinct merchants rather
   * than to batch size.
   */
  recipients?: string[]
}): Promise<void> {
  try {
    const recipients = preResolved ?? (await resolveRecipients(tx, merchantId))
    if (recipients.length === 0) return

    const title = notificationTitleForEvent(event)
    const href = notificationHrefForEvent(event, orderId)

    await tx
      .insert(notification)
      .values(
        recipients.map((userId) => ({
          userId,
          event,
          orderId,
          merchantId,
          actorName,
          title,
          href,
          subject: subject ?? null,
          createdAt: now,
        })),
      )
      // `notification_user_event_order_uniq` makes a repeated fact a no-op
      // rather than an error. Without this a duplicate would abort the whole
      // multi-recipient insert — one recipient who had already seen it would
      // cost every other recipient their notification too — and the throw would
      // be swallowed by the catch below, so it would look like success.
      .onConflictDoNothing()
  } catch {
    // See the docblock: an in-app row is best-effort by design.
  }
}

/**
 * Where a row should open, for a reader who can only see the merchant segment.
 *
 * The stored `href` column is not trusted. It was written before the routing fix
 * and still holds `/dashboard/orders/…` on any database that predates it, so a
 * row with an unrecognised event — the column is plain text, so a newer deploy
 * can write one this build does not know — would hand the merchant a link their
 * role guard bounces straight back to `/merchant`. That presents as a dead
 * notification and gives no hint why.
 *
 * So: a known event is computed, and an unknown one is coerced to the order it
 * belongs to. Money events carry no order and were always merchant-scoped, so
 * those still keep their stored href.
 */
function notificationHref(row: {
  event: string
  orderId: string | null
  href: string
}): string {
  if (isOrderEvent(row.event)) {
    return notificationHrefForEvent(row.event, row.orderId)
  }
  if (row.orderId) return `/merchant/orders/${row.orderId}`
  return row.href
}

/**
 * Who should see a fact about this merchant.
 *
 * The merchant owner and their moderators are the audience — they are the ones
 * who act on it. Warehouse admins and riders are deliberately excluded: they
 * work from their own queues and task lists, and notifying them about every
 * merchant's order traffic would bury the notifications that concern them.
 * Superadmins see everything through their order tables, not an inbox.
 */
async function resolveRecipients(
  tx: WebhookTx,
  merchantId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ userId: profile.userId })
    .from(profile)
    .where(
      and(
        eq(profile.merchantId, merchantId),
        eq(profile.role, "MERCHANT"),
        eq(profile.isActive, true),
      ),
    )
  return rows.map((r) => r.userId)
}

/**
 * A per-transaction recipient cache, so a batch pays one lookup per distinct
 * merchant rather than one per order.
 *
 * Mirrors the memo pattern `transitions.ts` already uses for merchants and
 * lanes. `resolveRecipients` returns a settled array (never a re-runnable query
 * builder), which is what makes a cache hit safe: a Drizzle builder would
 * re-execute on every `await` and the cache would issue the query anyway.
 */
export function createRecipientResolver(
  tx: WebhookTx,
): (merchantId: string) => Promise<string[]> {
  const cache = new Map<string, Promise<string[]>>()
  return (merchantId: string) => {
    const hit = cache.get(merchantId)
    if (hit) return hit
    const pending = resolveRecipients(tx, merchantId)
    cache.set(merchantId, pending)
    return pending
  }
}

/** Derived from the table so the row type cannot drift from the schema. */
export type NotificationRow = typeof notification.$inferSelect

export interface NotificationFeedResult {
  notifications: NotificationRow[]
  /** How many of the returned rows are newer than the reader's watermark. */
  newCount: number
}

/**
 * The reader's inbox, newest first.
 *
 * `newCount` is computed in the same query as the rows so the badge and the tray
 * can never disagree — a separate count query would race a new insert between
 * the two and briefly show "3 new" above a list of 2.
 *
 * `href` is recomputed from `event` + `orderId` on the way out rather than read
 * from the stored column. Both inputs are on the row, so this is exact — and it
 * means every notification written before a routing fix repairs itself instead
 * of staying broken forever. The column keeps being written for anything that
 * queries the table directly, but the tray never trusts it.
 */
export async function getNotificationsForUser(
  reader: Reader = dbRead,
  { userId, limit = 50 }: { userId: string; limit?: number },
): Promise<NotificationFeedResult> {
  const rows = await reader
    .select()
    .from(notification)
    .where(
      // Archived rows are filtered in SQL, not in the mapper: the tray polls
      // every 30s and shipping dismissed rows over the wire only to drop them
      // would make the read scale with everything the reader ever dismissed.
      and(eq(notification.userId, userId), isNull(notification.archivedAt)),
    )
    .orderBy(desc(notification.createdAt))
    .limit(limit)

  const notifications = rows.map((n) => ({
    ...n,
    href: notificationHref(n),
  }))

  // Derived from `readAt` rather than a watermark, so the badge and the list
  // are two readings of the same rows and cannot disagree about a moment.
  // `!n.readAt` rather than `=== null`: a row that has not been through the
  // mapper can carry `undefined`, and `undefined === null` is false — which
  // would report an unread row as read and hide it from the badge.
  const newCount = rows.filter((n) => !n.readAt).length

  return { notifications, newCount }
}

/**
 * Count unread notifications without loading the list.
 *
 * A separate endpoint from the list because the badge polls: counting rows
 * against `notification_user_unread_idx` is far cheaper than shipping 50 rows
 * every tick for a tray nobody opened.
 *
 * Archived rows are excluded rather than counted-as-read, so dismissing noise
 * clears the badge the same way reading it would.
 */
export async function countUnreadNotifications(
  reader: Reader = dbRead,
  { userId }: { userId: string },
): Promise<number> {
  const [row] = await reader
    .select({ n: sql<number>`count(*)::int` })
    .from(notification)
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        isNull(notification.archivedAt),
      ),
    )
  return row?.n ?? 0
}

/**
 * Mark notifications read.
 *
 * Scoped to the caller's own rows by `userId` as well as by id, so a crafted id
 * cannot reach another account's notifications.
 *
 * Archived rows are left alone: archiving is a stronger statement than reading,
 * and a bulk "mark all read" that also undid a dismissal would make the two
 * states impossible to keep apart.
 *
 * Idempotent — `readAt` is only written where it is still null, so a
 * double-submit does not move the timestamp and "read at" ordering stays
 * meaningful.
 */
export async function markNotificationsRead(
  updater: Pick<typeof db, "update"> = db,
  { userId, ids, now }: { userId: string; ids?: string[]; now: string },
): Promise<number> {
  const scoped =
    ids && ids.length > 0 ? and(inArray(notification.id, ids)) : undefined

  const rows = await updater
    .update(notification)
    .set({ readAt: now })
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        isNull(notification.archivedAt),
        scoped,
      ),
    )
    .returning({ id: notification.id })

  return rows.length
}

/**
 * Dismiss or restore a notification.
 *
 * Archiving clears nothing else: it is a view filter, and restoring a row must
 * hand back exactly what it had before.
 */
export async function setNotificationArchived(
  updater: Pick<typeof db, "update"> = db,
  {
    userId,
    id,
    archived,
    now,
  }: {
    userId: string
    id: string
    archived: boolean
    now: string
  },
): Promise<boolean> {
  const rows = await updater
    .update(notification)
    .set({ archivedAt: archived ? now : null })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
    .returning({ id: notification.id })

  return rows.length > 0
}
