import { eq, or } from "drizzle-orm"
import {
  Bike,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react"
import { cache } from "react"
import { db } from "@/lib/db"
import { merchant, order, rider, warehouse } from "@/lib/db/schema"
import type { Order, OrderStatus } from "@/lib/types"

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

export function formatStamp(iso?: string | Date | null) {
  if (!iso) return null
  const d = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// ─── types ───────────────────────────────────────────────────────────────────

export type StepKey =
  | "PLACED"
  | "APPROVED"
  | "PICKED_UP"
  | "IN_WAREHOUSE"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"

export const STATUS_RANK: Record<OrderStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  PICKED_UP: 2,
  IN_WAREHOUSE: 3,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  FAILED_ATTEMPT: 4,
  RETURNED: 4,
  CANCELLED: 0,
}

export const STEPS: {
  key: StepKey
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  rank: number
  timestamp: (o: Order) => string | Date | null | undefined
}[] = [
  {
    key: "PLACED",
    label: "Order placed",
    description: "Merchant created the shipment",
    icon: ClipboardCheck,
    rank: 0,
    timestamp: (o) => o.createdAt,
  },
  {
    key: "APPROVED",
    label: "Approved",
    description: "Verified and ready for pickup",
    icon: PackageCheck,
    rank: 1,
    timestamp: (o) => o.approvedAt,
  },
  {
    key: "PICKED_UP",
    label: "Picked up",
    description: "Rider collected from merchant",
    icon: Bike,
    rank: 2,
    timestamp: (o) => o.pickedUpAt,
  },
  {
    key: "IN_WAREHOUSE",
    label: "At sorting hub",
    description: "Arrived at the delivery hub",
    icon: Warehouse,
    rank: 3,
    timestamp: (o) => o.receivedAtWarehouseAt,
  },
  {
    key: "OUT_FOR_DELIVERY",
    label: "Out for delivery",
    description: "Rider is heading to you now",
    icon: Truck,
    rank: 4,
    timestamp: (o) => o.outForDeliveryAt ?? o.dispatchedAt,
  },
  {
    key: "DELIVERED",
    label: "Delivered",
    description: "Handed to the recipient",
    icon: CheckCircle2,
    rank: 5,
    timestamp: (o) => o.deliveredAt,
  },
]

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

  const o = rows[0] ?? null
  if (!o) return null

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
    order: o as Order,
    merchant: merchantRows[0] ?? null,
    pickupRider: pickupRiderRows[0] ?? null,
    deliveryRider: deliveryRiderRows[0] ?? null,
    warehouse: warehouseRows[0] ?? null,
    matchedByToken,
  }
})
