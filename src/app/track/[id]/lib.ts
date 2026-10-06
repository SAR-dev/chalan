import { eq, or } from "drizzle-orm"
import { cache } from "react"
import { db } from "@/lib/db"
import { merchant, order, rider, warehouse } from "@/lib/db/schema"
import type { Order, OrderStatus } from "@/lib/types"

export type { StepKey, TimelineStep } from "@/lib/order-timeline"
// ─── timeline ────────────────────────────────────────────────────────────────
//
// The step list, its ranks and its formatter live in `@/lib/order-timeline`,
// shared with the admin order table. This module pulls in `db`, so it can never
// be the shared home — but its components import from here, so everything is
// re-exported and `./lib` stays their single import point.
export {
  formatStamp,
  STATUS_RANK,
  STEPS,
  stepDescription,
} from "@/lib/order-timeline"

// ─── helpers ─────────────────────────────────────────────────────────────────

export function maskPhone(phone: string) {
  const digits = phone.replace(/\s+/g, "")
  if (digits.length <= 3) return digits
  return `••• ••• ${digits.slice(-3)}`
}

export function generalArea(o: Order) {
  const parts = o.deliveryAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const area = parts.length > 1 ? parts[parts.length - 2] : parts[0]
  return [area, o.deliveryCity].filter(Boolean).join(", ")
}

// ─── status copy ─────────────────────────────────────────────────────────────

export const STATUS_COPY: Record<
  OrderStatus,
  { headline: string; sub: string; color: string }
> = {
  PENDING: {
    headline: "Awaiting approval",
    sub: "Your order is in the queue — we'll pick it up shortly.",
    color: "text-chart-3",
  },
  APPROVED: {
    headline: "Ready for pickup",
    sub: "A rider will collect your parcel from the merchant soon.",
    color: "text-chart-1",
  },
  OUT_FOR_PICKUP: {
    headline: "Rider is on the way!",
    sub: "A rider is heading to the merchant to collect your parcel.",
    color: "text-chart-1",
  },
  PICKED_UP: {
    headline: "Parcel collected",
    sub: "Your parcel is on its way to the sorting hub.",
    color: "text-chart-1",
  },
  IN_WAREHOUSE: {
    headline: "At the sorting hub",
    sub: "Your parcel has arrived and is being prepared for delivery.",
    color: "text-chart-2",
  },
  IN_TRANSIT: {
    headline: "In transit",
    sub: "Your parcel is moving between facilities.",
    color: "text-chart-4",
  },
  OUT_FOR_DELIVERY: {
    headline: "On the way!",
    sub: "A rider is heading to your address right now.",
    color: "text-chart-4",
  },
  DELIVERED: {
    headline: "Delivered ✓",
    sub: "Your parcel was handed to the recipient.",
    color: "text-chart-2",
  },
  FAILED_ATTEMPT: {
    headline: "Delivery attempted",
    sub: "We couldn't complete delivery. A new attempt will be scheduled.",
    color: "text-destructive",
  },
  RETURNED: {
    headline: "Returned to merchant",
    sub: "This parcel was returned and will not be delivered.",
    color: "text-muted-foreground",
  },
  CANCELLED: {
    headline: "Order cancelled",
    sub: "This order has been cancelled and will not be delivered.",
    color: "text-destructive",
  },
}

// ─── data fetching ────────────────────────────────────────────────────────────

// Cached so `generateMetadata` and the page body share one query set per
// request instead of hitting the DB twice (1 order select + up to 4 child
// selects either time).
//
// The public key may be either the order's **tracking token** (shared link,
// grants the note write) or its human **order code** (`ORD-100001E`, typed in
// the tracking search / printed on parcels — read-only). One query resolves
// both; `matchedByToken` tells the page whether the write capability is
// present.
export const fetchOrderData = cache(async (idOrToken: string) => {
  const raw = idOrToken.trim()
  const normalized = raw.toUpperCase()

  const rows = await db
    .select()
    .from(order)
    .where(or(eq(order.trackingToken, raw), eq(order.id, normalized)))
    .limit(1)

  const row = rows[0] ?? null
  if (!row) return null

  // The recipient's email is personal data and this is a public page, so it is
  // dropped here rather than merely left un-rendered. Removing it from the
  // object alone would not be enough — the return below casts to `Order`, which
  // would re-declare the field and type a future `order.recipientMail` read as
  // present while it was actually `undefined`. So it is stripped from both the
  // value and the type, and any later attempt to render it fails to compile
  // instead of quietly publishing the address to anyone holding the link.
  const { recipientMail: _recipientMail, ...o } = row

  const matchedByToken = Boolean(o.trackingToken) && o.trackingToken === raw

  const [merchantRows, pickupRiderRows, deliveryRiderRows, warehouseRows] =
    await Promise.all([
      db.select().from(merchant).where(eq(merchant.id, o.merchantId)).limit(1),
      o.pickupRiderId
        ? db.select().from(rider).where(eq(rider.id, o.pickupRiderId)).limit(1)
        : Promise.resolve([]),
      o.deliveryRiderId
        ? db
            .select()
            .from(rider)
            .where(eq(rider.id, o.deliveryRiderId))
            .limit(1)
        : Promise.resolve([]),
      o.warehouseId
        ? db
            .select()
            .from(warehouse)
            .where(eq(warehouse.id, o.warehouseId))
            .limit(1)
        : Promise.resolve([]),
    ])

  return {
    // See the strip above: `Order` minus the one field the public must not get.
    order: o as Omit<Order, "recipientMail">,
    merchant: merchantRows[0] ?? null,
    pickupRider: pickupRiderRows[0] ?? null,
    deliveryRider: deliveryRiderRows[0] ?? null,
    warehouse: warehouseRows[0] ?? null,
    matchedByToken,
  }
})
