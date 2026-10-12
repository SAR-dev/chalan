import { and, desc, eq, gt, sql } from "drizzle-orm"
import { db, dbRead } from "@/lib/db"
import { notification, profile } from "@/lib/db/schema"
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
  recipients: preResolved,
}: {
  tx: WebhookTx
  event: OrderEvent
  orderId: string | null
  merchantId: string
  actorName: string | null
  now: string
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

    await tx.insert(notification).values(
      recipients.map((userId) => ({
        userId,
        event,
        orderId,
        merchantId,
        actorName,
        title,
        href,
        createdAt: now,
      })),
    )
  } catch {
    // See the docblock: an in-app row is best-effort by design.
  }
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
  {
    userId,
    seenAt,
    limit = 50,
  }: { userId: string; seenAt: string | null; limit?: number },
): Promise<NotificationFeedResult> {
  const rows = await reader
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(limit)

  const notifications = rows.map((n) => ({
    ...n,
    // The column is plain text, so an event written by a newer deploy than this
    // one is not in the union. Falling back to the stored href beats throwing
    // away a notification the reader could otherwise still open.
    href: isOrderEvent(n.event)
      ? notificationHrefForEvent(n.event, n.orderId)
      : n.href,
  }))

  const newCount = seenAt
    ? rows.filter((n) => n.createdAt > seenAt).length
    : rows.length

  return {
    notifications,
    newCount,
  }
}

/**
 * Count unread notifications without loading the list.
 *
 * A separate endpoint from the list because the badge polls: counting rows
 * against `notification_user_created_idx` is far cheaper than shipping 50 rows
 * every tick for a tray nobody opened.
 */
export async function countUnreadNotifications(
  reader: Reader = dbRead,
  { userId, seenAt }: { userId: string; seenAt: string | null },
): Promise<number> {
  const [row] = await reader
    .select({ n: sql<number>`count(*)::int` })
    .from(notification)
    .where(
      seenAt
        ? and(
            eq(notification.userId, userId),
            gt(notification.createdAt, seenAt),
          )
        : eq(notification.userId, userId),
    )
  return row?.n ?? 0
}

/**
 * Stamp the reader's watermark.
 *
 * Monotonic by construction: `GREATEST` with the stored value means a client
 * whose clock is behind, or that double-submits, cannot re-badge notifications
 * it has already seen. Mirrors `POST /api/announcements/seen`.
 */
export async function markNotificationsSeen(
  updater: Pick<typeof db, "update"> = db,
  { userId, now }: { userId: string; now: string },
): Promise<void> {
  await updater
    .update(profile)
    .set({
      notificationsSeenAt: sql`GREATEST(COALESCE(${profile.notificationsSeenAt}, ${now}::timestamptz), ${now}::timestamptz)`,
    })
    .where(eq(profile.userId, userId))
}
