import {
  createRecipientResolver,
  emitNotificationEvent,
} from "@/lib/notifications"
import type { WebhookTx } from "@/lib/webhooks"
import { emitWebhookEvent } from "@/lib/webhooks"

// =============================================================================
// The order domain event - one emit, two sinks (webhooks + in-app notifications).
// =============================================================================
//
// Every order fact worth telling someone about is raised here exactly once, then
// fanned out to the two sinks that care. The alternative - each sink wiring its
// own hook into the transitions - is how the two drift apart and a new event
// lands in one and not the other.
//
// The emitters run inside the caller's transaction, so a notification can never
// describe a state change that rolled back. Both are individually wrapped in
// their own try/catch, so a failing sink cannot fail the transition; see
// `emitWebhookEvent` for why that trade is deliberate.

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

/** The subset that is also a merchant-visible webhook event. */
const WEBHOOK_EVENTS = new Set<string>([
  "order.created",
  "order.approved",
  "order.dispatched",
  "order.picked-up",
  "order.out-for-delivery",
  "order.delivered",
  "order.failed",
  "order.returned",
  "order.cancelled",
])

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
  // Money events have no order to show, and they belong to the merchant's own
  // screens rather than a customer tracking page.
  if (event === "cash.submitted") return "/merchant/payouts"
  if (event === "payout.approved") return "/merchant/payouts"
  // Defensive: an order event with no order behind it still has to link
  // somewhere real, never to a dangling `/dashboard/orders/`.
  if (!orderId) return "/merchant/orders"
  return `/dashboard/orders/${orderId}`
}

export interface OrderEventInput {
  tx: WebhookTx
  event: OrderEvent
  orderId?: string | null
  /** The merchant the order belongs to; also the audience for the notification. */
  merchantId: string
  data: Record<string, unknown>
  /**
   * Who acted, when known - a rider scanning a parcel, an admin approving. It is
   * what makes a notification read as "RIDER-014 delivered ORD-9" rather than a
   * bare status word.
   */
  actorName?: string | null
  now?: string
  /**
   * Shared recipient resolver for a batch.
   *
   * A bulk transition raises one event per order; without this, each would pay
   * its own recipient lookup. Pass one resolver across the whole batch so the
   * cost tracks distinct merchants rather than batch size.
   */
  resolveRecipients?: (merchantId: string) => Promise<string[]>
}

/**
 * Raise one order fact to both sinks.
 *
 * Never throws: a notification that cannot be written must not roll back a
 * delivery, exactly as for webhooks.
 */
export async function emitOrderEvent(input: OrderEventInput): Promise<void> {
  const {
    tx,
    event,
    orderId,
    merchantId,
    data,
    actorName,
    now,
    resolveRecipients: sharedResolver,
  } = input
  const timestamp = now ?? new Date().toISOString()

  if (WEBHOOK_EVENTS.has(event)) {
    await emitWebhookEvent({
      tx,
      merchantId,
      event: event as Parameters<typeof emitWebhookEvent>[0]["event"],
      orderId,
      data,
      now: timestamp,
    })
  }

  await emitNotificationEvent({
    tx,
    event,
    orderId: orderId ?? null,
    merchantId,
    actorName: actorName ?? null,
    now: timestamp,
    ...(sharedResolver ? { recipients: await sharedResolver(merchantId) } : {}),
  })
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
