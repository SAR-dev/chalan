import { type BadgeTone } from "@/lib/constants"
import { isOrderEvent, type OrderEvent } from "@/lib/order-event"

// =============================================================================
// What stage is this order at?
//
// The title alone cannot answer it: every step of one parcel carries the same
// title, so a merchant scanning twenty rows sees twenty identical lines and has
// to open each one to learn whether it was delivered or cancelled. The event is
// already on the row — it just had no readable form.
//
// This is a *text* label first and a colour second, deliberately. The status
// icons were the only signal carrying state, which means the whole feature rested
// on hue: a reader who cannot separate `success` green from `info` blue, or
// anyone on a screen where the two are close, gets nothing. Naming the step makes
// the colour decorative reinforcement rather than the message.
// =============================================================================

/**
 * Lifecycle steps versus money moves.
 *
 * Worth separating on its own: `cash.submitted` and `payout.approved` both reuse
 * tones the order statuses use (`success`, `violet`), so a payout and a
 * delivered parcel were visually indistinguishable. A money row is about the
 * merchant's balance, not a parcel — conflating them makes a payout look like
 * another delivery update.
 */
export type StatusKind = "lifecycle" | "money"

export interface NotificationStatus {
  /** Shown as the chip text. Never empty — a chip with no words is decoration. */
  label: string
  tone: BadgeTone
  kind: StatusKind
}

const STATUS: Record<OrderEvent, NotificationStatus> = {
  "order.created": { label: "New", tone: "pending", kind: "lifecycle" },
  "order.approved": { label: "Approved", tone: "info", kind: "lifecycle" },
  "order.picked-up": { label: "Picked up", tone: "violet", kind: "lifecycle" },
  "order.dispatched": { label: "Dispatched", tone: "brand", kind: "lifecycle" },
  "order.out-for-delivery": {
    label: "Out for delivery",
    tone: "transit",
    kind: "lifecycle",
  },
  "order.delivered": { label: "Delivered", tone: "success", kind: "lifecycle" },
  "order.failed": { label: "Failed", tone: "danger", kind: "lifecycle" },
  "order.returned": { label: "Returned", tone: "neutral", kind: "lifecycle" },
  "order.cancelled": { label: "Cancelled", tone: "slate", kind: "lifecycle" },
  "cash.submitted": {
    label: "Payout requested",
    tone: "success",
    kind: "money",
  },
  "payout.approved": {
    label: "Payout approved",
    tone: "violet",
    kind: "money",
  },
}

/**
 * The status for an event, or null when the value is not one this build knows.
 *
 * `event` is plain text in the database, so a newer deploy can write a value an
 * older build has never heard of. Returning null lets the caller fall back
 * rather than render a chip that claims to be a status it guessed.
 */
export function notificationStatus(event: string): NotificationStatus | null {
  return isOrderEvent(event) ? STATUS[event] : null
}
