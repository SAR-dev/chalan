// =============================================================================
// Grouping the inbox — pure, and importable from the client.
//
// A client hook renders the grouped feed, and this logic cannot live in
// `src/lib/notifications.ts` because that module reaches `@/lib/db` and would drag
// `pg` — and so `fs`, `net`, `tls` and `dns` — into the browser bundle. Same trap
// as `src/lib/order-event.ts`; see `order-event-boundary.spec.ts`.
//
// The row shape is declared structurally rather than derived from
// `@/lib/db/schema`, matching `AppNotification` in the notifications hook. The
// schema barrel is importable from a browser (it is column definitions, no pool)
// but pulling it in would add the whole schema to the bundle, and the hook
// already keeps its own mirror of the row.
// =============================================================================

/** The fields grouping needs. Satisfied by a `notification` table row. */
export interface GroupableNotification {
  id: string
  event: string
  orderId: string | null
  title: string
  href: string
  createdAt: string
  actorName: string | null
}

/**
 * One row per order, newest fact first.
 *
 * A single order generates an event per lifecycle step — created, approved,
 * picked up, dispatched, out for delivery, delivered — so an ungrouped inbox
 * shows the same order six times over, which is the complaint this exists to fix.
 * The group's row is the *latest* fact, because that is the one a merchant
 * actually wants ("where is my parcel?"); the count says how much happened
 * underneath it.
 *
 * Money events carry no orderId and are never grouped: two `cash.submitted` rows
 * are two genuinely different facts, and collapsing them by event would hide
 * both. They pass through one-for-one.
 */
export interface NotificationGroup {
  /** Stable React key: the orderId, or the row id for an ungrouped money event. */
  key: string
  orderId: string | null
  /** The latest event, which drives both the icon and the title. */
  event: string
  title: string
  href: string
  createdAt: string
  /** Notifications collapsed into this row. 1 when nothing was collapsed. */
  count: number
  /** Every row id in the group, so a reader can tell whether any member is new. */
  ids: string[]
  actorName: string | null
}

/**
 * Collapse an already newest-first list into one row per order.
 *
 * Order matters and is the caller's to guarantee: the first time an orderId is
 * seen becomes the group's row, so feeding this a newest-first list yields the
 * latest fact as the representative without a second sort. Passing an unsorted
 * list silently produces a group headed by whichever row happened to arrive
 * first, which is why `getNotificationsForUser` orders by `createdAt desc`.
 */
export function groupNotifications(
  rows: GroupableNotification[],
): NotificationGroup[] {
  const byOrder = new Map<string, NotificationGroup>()
  const groups: NotificationGroup[] = []

  for (const row of rows) {
    if (!row.orderId) {
      groups.push({
        key: row.id,
        orderId: null,
        event: row.event,
        title: row.title,
        href: row.href,
        createdAt: row.createdAt,
        count: 1,
        ids: [row.id],
        actorName: row.actorName,
      })
      continue
    }

    const existing = byOrder.get(row.orderId)
    if (!existing) {
      const group: NotificationGroup = {
        key: row.orderId,
        orderId: row.orderId,
        event: row.event,
        title: row.title,
        href: row.href,
        createdAt: row.createdAt,
        count: 1,
        ids: [row.id],
        actorName: row.actorName,
      }
      byOrder.set(row.orderId, group)
      groups.push(group)
      continue
    }

    // The representative row is already the newest; only the tally moves. The
    // actor and href follow the newest fact too, and `existing` is that newest
    // row, so there is nothing to update here beyond the count and the ids.
    existing.count += 1
    existing.ids.push(row.id)
  }

  return groups
}
