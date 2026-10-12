// =============================================================================
// The order event vocabulary — pure, and importable from the client.
//
// Split out of `order-events.ts` because that module emits events: it imports
// `@/lib/webhooks` and `@/lib/notifications`, which reach `@/lib/db` and drag
// `fs`, `net`, `tls` and `dns` with them. A client component that needs only to
// know which event a row describes would then fail the build with
// "Can't resolve 'fs'" — the same trap `src/lib/version.ts` documents for
// TopNav.
//
// Nothing here may import a database, a transaction type, or anything else
// server-only. If a new consumer needs it in the browser, it belongs in this
// file; `order-events.ts` re-exports all of it, so server imports are unchanged.
// =============================================================================

// The webhook vocabulary is the canonical list of order facts: a merchant
// integrating against /api/v1/orders can only ever observe these. Two further
// facts (cash submitted, payout approved) are platform-side money events with
// no public counterpart, so they are named separately rather than widening the
// public contract.
export const ORDER_EVENTS = [
  "order.created",
  "order.approved",
  "order.dispatched",
  "order.picked-up",
  "order.out-for-delivery",
  "order.delivered",
  "order.failed",
  "order.returned",
  "order.cancelled",
  "cash.submitted",
  "payout.approved",
] as const

export type OrderEvent = (typeof ORDER_EVENTS)[number]

export function isOrderEvent(value: unknown): value is OrderEvent {
  return (
    typeof value === "string" &&
    (ORDER_EVENTS as readonly string[]).includes(value)
  )
}

/** Where an in-app notification should land when it is opened. */
export function notificationHrefForEvent(
  event: OrderEvent,
  orderId: string | null,
): string {
  // Every branch here is merchant-scoped, and has to be. `resolveRecipients`
  // delivers notifications only to MERCHANT profiles (see
  // src/lib/notifications.ts), so a `/dashboard/…` href is a link the only
  // possible reader cannot open — it bounces through the role guard and drops
  // them on `/merchant` instead, which is indistinguishable from the
  // notification being broken.
  //
  // The order detail route takes the order **id** despite the `[code]` segment
  // name — see `setViewOrderCode(o.id)` in the order list.
  if (event === "cash.submitted") return "/merchant/payouts"
  if (event === "payout.approved") return "/merchant/payouts"
  // Defensive: an order event with no order behind it still has to link
  // somewhere real, never to a dangling `/merchant/orders/`.
  if (!orderId) return "/merchant/orders"
  return `/merchant/orders/${orderId}`
}

/**
 * The one-line summary an inbox row shows.
 *
 * Built here rather than stored per-row so the copy is a pure function of the
 * event and cannot rot against the template that produced it.
 */
export function notificationTitleForEvent(event: OrderEvent): string {
  switch (event) {
    case "order.created":
      return "New order received"
    case "order.approved":
      return "Order approved"
    case "order.dispatched":
      return "Order dispatched"
    case "order.picked-up":
      return "Rider picked up the parcel"
    case "order.out-for-delivery":
      return "Out for delivery"
    case "order.delivered":
      return "Order delivered"
    case "order.failed":
      return "Delivery attempt failed"
    case "order.returned":
      return "Order returned"
    case "order.cancelled":
      return "Order cancelled"
    case "cash.submitted":
      return "Cash submitted"
    case "payout.approved":
      return "Payout approved"
  }
}
