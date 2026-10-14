import {
  createRecipientResolver,
  emitNotificationEvent,
} from "@/lib/notifications"
import { type OrderEvent } from "@/lib/order-event"
import type { WebhookTx } from "@/lib/webhooks"
import { emitWebhookEvent } from "@/lib/webhooks"

// The vocabulary itself lives in `order-event.ts` because client components need
// it and this module cannot be imported from the browser — see the docblock
// there. Re-exported so the server-side call sites keep importing it from here.
export {
  isOrderEvent,
  notificationHrefForEvent,
  notificationTitleForEvent,
  ORDER_EVENTS,
  type OrderEvent,
} from "@/lib/order-event"

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
  /** See `subject` on `emitNotificationEvent`. */
  subject?: string | null
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
    subject,
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
    subject: subject ?? null,
    ...(sharedResolver ? { recipients: await sharedResolver(merchantId) } : {}),
  })
}
