import { eq } from "drizzle-orm"
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Bike,
  CheckCircle2,
  ClipboardCheck,
  ImageOff,
  MapPin,
  Package,
  PackageCheck,
  Search,
  StickyNote,
  Store,
  Truck,
  Undo2,
  User,
  Warehouse,
  XCircle,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { cache, Fragment } from "react"
import { ImageZoom } from "@/components/image-zoom"
import { PublicFooter } from "@/components/public-footer"
import { ThemeToggle } from "@/components/theme-toggle"
import { siteConfig } from "@/config/site"
import { ReceiverNoteWidget } from "@/features/orders/components/receiver-note-widget"
import { db } from "@/lib/db"
import { merchant, order, rider, warehouse } from "@/lib/db/schema"
import type { Order, OrderStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

// ─── helpers ─────────────────────────────────────────────────────────────────

function maskPhone(phone: string) {
  const digits = phone.replace(/\s+/g, "")
  if (digits.length <= 3) return digits
  return `••• ••• ${digits.slice(-3)}`
}

function generalArea(o: Order) {
  const parts = o.deliveryAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const area = parts.length > 1 ? parts[parts.length - 2] : parts[0]
  return [area, o.deliveryCity].filter(Boolean).join(", ")
}

function formatStamp(iso?: string | Date | null) {
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

type StepKey =
  | "PLACED"
  | "APPROVED"
  | "PICKED_UP"
  | "IN_WAREHOUSE"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"

const STATUS_RANK: Record<OrderStatus, number> = {
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

const STEPS: {
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

const STATUS_COPY: Record<
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
const fetchOrderData = cache(async (idOrCode: string) => {
  const normalized = idOrCode.trim().toUpperCase()

  // Try matching by id
  const rows = await db
    .select()
    .from(order)
    .where(eq(order.id, normalized))
    .limit(1)

  const o = rows[0] ?? null
  if (!o) return null

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
  }
})

// ─── page ─────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const code = decodeURIComponent(id).trim().toUpperCase()
  const data = await fetchOrderData(code)

  const statusLabel = data
    ? STATUS_COPY[data.order.status].headline
    : "Not found"
  const merchant = data?.merchant?.businessName
    ? ` · ${data.merchant.businessName}`
    : ""

  return {
    title: `${code} – ${statusLabel}`,
    description: `Live delivery status for parcel ${code}${merchant} on ${siteConfig.name}.`,
    robots: { index: false, follow: false },
  }
}

export default async function TrackDetailPage({ params }: Props) {
  const { id } = await params
  const idOrCode = decodeURIComponent(id).trim().toUpperCase()
  const data = await fetchOrderData(idOrCode)

  // If not found, render a friendly not-found UI (don't use Next's notFound()
  // so we can still show the search header)
  return (
    <main className="bg-background min-h-screen">
      {/* Header */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <Link href="/track" className="group flex items-center gap-2.5">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md shadow-sm transition-shadow group-hover:shadow-md">
              <Package className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-xs font-medium sm:inline">
              Order Tracking
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-8">
        {/* Back / search again button */}
        <Link
          href="/track"
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Track another parcel
        </Link>

        {!data ? <NotFound code={idOrCode} /> : <OrderDetail {...data} />}
      </div>
      <PublicFooter />
    </main>
  )
}

// ─── not found ────────────────────────────────────────────────────────────────

function NotFound({ code }: { code: string }) {
  return (
    <div className="py-12 text-center">
      <div className="bg-muted ring-border mb-5 inline-flex size-14 items-center justify-center rounded-2xl ring-1">
        <Package className="text-muted-foreground size-6" />
      </div>
      <h2 className="mb-2 text-lg font-semibold">Parcel not found</h2>
      <p className="text-muted-foreground mx-auto mb-6 max-w-xs text-sm leading-relaxed">
        No parcel found for{" "}
        <span className="text-foreground font-mono">{code}</span>. Double-check
        your tracking code and try again.
      </p>

      {/* Inline search so user doesn't need to navigate back */}
      <form
        method="GET"
        action="/track"
        className="mx-auto flex max-w-sm gap-2.5"
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            name="code"
            placeholder="Try another code…"
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-lg border pr-3.5 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium shadow-sm transition-colors"
        >
          Track <ArrowRight className="size-3.5" />
        </button>
      </form>
    </div>
  )
}

// ─── order detail ─────────────────────────────────────────────────────────────

function OrderDetail({
  order: o,
  merchant: merchantData,
  pickupRider,
  deliveryRider,
  warehouse: warehouseData,
}: NonNullable<Awaited<ReturnType<typeof fetchOrderData>>>) {
  const statusInfo = STATUS_COPY[o.status]

  return (
    <div className="space-y-4">
      {/* Status hero card */}
      <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="p-5 pb-4">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div>
              <p
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  statusInfo.color,
                )}
              >
                {statusInfo.headline}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {statusInfo.sub}
              </p>
            </div>
            <span className="text-muted-foreground bg-muted mt-0.5 shrink-0 rounded-md px-2.5 py-1 font-mono text-xs">
              {o.id}
            </span>
          </div>
        </div>

        {/* Meta strip */}
        <div className="border-border/60 flex flex-wrap gap-x-6 gap-y-2.5 border-t px-5 py-3.5">
          {merchantData && (
            <div className="flex min-w-0 items-center gap-1.5">
              <Store className="text-muted-foreground size-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  From
                </p>
                <p className="truncate text-xs font-medium">
                  {merchantData.businessName}
                </p>
              </div>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-1.5">
            <MapPin className="text-muted-foreground size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                To
              </p>
              <p className="truncate text-xs font-medium">{generalArea(o)}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <User className="text-muted-foreground size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Customer
              </p>
              <p className="truncate text-xs font-medium">
                {o.recipientName.split(" ")[0]} · {maskPhone(o.recipientPhone)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline card */}
      <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
        <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-widest uppercase">
          Delivery progress
        </p>
        <Timeline
          order={o}
          pickupRider={pickupRider}
          warehouse={warehouseData}
          deliveryRider={deliveryRider}
        />
      </div>

      {/* Merchant note (read-only) */}
      {o.merchantNote && (
        <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <StickyNote className="text-muted-foreground size-4" />
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
              Note from merchant
            </p>
          </div>
          <p className="text-sm leading-relaxed">{o.merchantNote}</p>
        </div>
      )}

      {/* Receiver note widget — lets the recipient leave a delivery instruction */}
      <ReceiverNoteWidget
        orderId={o.id}
        initialNote={o.receiverNote}
        isTerminal={
          o.status === "DELIVERED" ||
          o.status === "RETURNED" ||
          o.status === "CANCELLED"
        }
      />

      {/* Search again button */}
      <div className="pt-2 text-center">
        <Link
          href="/track"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <Search className="size-4" />
          Track another parcel
        </Link>
      </div>
    </div>
  )
}

// ─── timeline (server component, no client hooks) ─────────────────────────────

type RiderRow = { name: string; phone: string; zone: string }
type WarehouseRow = { name: string; city: string }

function Timeline({
  order: o,
  pickupRider,
  warehouse: warehouseData,
  deliveryRider,
}: {
  order: Order
  pickupRider: RiderRow | null
  warehouse: WarehouseRow | null
  deliveryRider: RiderRow | null
}) {
  const currentRank = STATUS_RANK[o.status]
  const isReturned = o.status === "RETURNED"
  const isFailed = o.status === "FAILED_ATTEMPT"
  const isCancelled = o.status === "CANCELLED"

  type HandlerInfo = { role: string; name: string; detail?: string } | null
  const stepHandlers: Partial<Record<StepKey, HandlerInfo>> = {
    PICKED_UP: pickupRider
      ? {
          role: "Pickup rider",
          name: pickupRider.name,
          detail: [maskPhone(pickupRider.phone), pickupRider.zone]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    IN_WAREHOUSE: warehouseData
      ? {
          role: "Sorting hub",
          name: warehouseData.name,
          detail: [
            warehouseData.city,
            o.receivedByWarehouse ? `Logged by ${o.receivedByWarehouse}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    OUT_FOR_DELIVERY: deliveryRider
      ? {
          role: "Delivery rider",
          name: deliveryRider.name,
          detail: [maskPhone(deliveryRider.phone), deliveryRider.zone]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    DELIVERED: deliveryRider
      ? {
          role: "Delivery rider",
          name: deliveryRider.name,
          detail: [maskPhone(deliveryRider.phone), deliveryRider.zone]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
  }

  return (
    <ol className="relative space-y-0">
      {STEPS.map((step, index) => {
        const isLast = index === STEPS.length - 1
        const reached = currentRank >= step.rank
        const isCurrent =
          currentRank === step.rank &&
          !isReturned &&
          !isCancelled &&
          !(isFailed && step.key === "DELIVERED")
        const isCompleted = reached && !isCurrent
        const Icon = step.icon
        const stamp = formatStamp(step.timestamp(o))
        const handler = stepHandlers[step.key] ?? null

        const showFailedAfter = step.key === "OUT_FOR_DELIVERY" && isFailed
        const showReturnedAfter = step.key === "OUT_FOR_DELIVERY" && isReturned
        const showCancelledAfter =
          isCancelled && step.rank === currentRank && !isLast
        const hasExceptionAfter =
          showFailedAfter || showReturnedAfter || showCancelledAfter

        return (
          <Fragment key={step.key}>
            <li className="flex gap-3.5">
              {/* Rail */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border transition-all",
                    isCompleted
                      ? "border-chart-2/30 bg-chart-2/15 text-chart-2"
                      : isCurrent
                        ? "border-primary/30 bg-primary/15 text-primary"
                        : "border-border bg-muted text-muted-foreground/50",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                {(!isLast || hasExceptionAfter) && (
                  <span
                    className={cn(
                      "mt-1 mb-0 w-0.5 flex-1 rounded-full",
                      isCompleted || (isCurrent && currentRank > step.rank)
                        ? "bg-chart-2/50"
                        : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  "pb-6",
                  isLast && !hasExceptionAfter && "pb-1",
                  "min-w-0 flex-1 pt-0.5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      "text-sm leading-none font-medium",
                      reached ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  >
                    {step.label}
                  </p>
                  {isCurrent && (
                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      <span className="bg-primary inline-block size-1.5 animate-pulse rounded-full" />
                      Live
                    </span>
                  )}
                </div>
                {stamp ? (
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {stamp}
                  </p>
                ) : (
                  <p className="text-muted-foreground/50 mt-1 text-xs">
                    {step.description}
                  </p>
                )}
                {handler && reached && (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      {handler.role}
                    </p>
                    <p className="text-foreground text-xs font-medium">
                      {handler.name}
                    </p>
                    {handler.detail && (
                      <p className="text-muted-foreground text-xs">
                        {handler.detail}
                      </p>
                    )}
                  </div>
                )}
                {step.key === "PICKED_UP" && reached && (
                  <div className="mt-2.5">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Pickup proof
                    </p>
                    {o.pickupProofRefs && o.pickupProofRefs.length > 0 ? (
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        {o.pickupProofRefs.map((link, i) => (
                          <img
                            key={i}
                            src={link}
                            alt={`Pickup proof ${i + 1}`}
                            className="size-full rounded-md object-cover"
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60 mt-1 inline-flex items-center gap-1.5 text-xs italic">
                        <ImageOff className="size-3.5" />
                        No proof photo uploaded.
                      </span>
                    )}
                  </div>
                )}
                {step.key === "DELIVERED" && reached && (
                  <div className="mt-2.5">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Proof of delivery
                    </p>
                    {o.deliveryProofRef ? (
                      <ImageZoom
                        src={o.deliveryProofRef}
                        alt="Proof of delivery"
                        className="border-border bg-muted mt-1.5 block size-24 overflow-hidden rounded-md border object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground/60 mt-1 inline-flex items-center gap-1.5 text-xs italic">
                        <ImageOff className="size-3.5" />
                        No proof photo uploaded.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>

            {showFailedAfter && (
              <li key="FAILED_ATTEMPT" className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <XCircle className="size-4" />
                  </span>
                  <span
                    className="bg-border my-1 min-h-7 w-0.5 flex-1 rounded-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="pt-0.5 pb-7">
                  <p className="text-destructive text-sm font-medium">
                    Delivery attempt failed
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(o.failedAttemptAt) ??
                      "A new attempt will be scheduled."}
                  </p>
                  {o.failureNote ? (
                    <p className="bg-destructive/10 text-destructive mt-2 rounded-md px-2.5 py-1.5 text-xs leading-snug">
                      {o.failureNote}
                    </p>
                  ) : null}
                </div>
              </li>
            )}

            {showReturnedAfter && (
              <li key="RETURNED" className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="border-border bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <Undo2 className="size-4" />
                  </span>
                  <span
                    className="bg-border my-1 min-h-7 w-0.5 flex-1 rounded-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="pt-0.5 pb-7">
                  <p className="text-sm font-medium">Returned to merchant</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(o.returnedAt) ??
                      "This parcel was returned and will not be delivered."}
                  </p>
                </div>
              </li>
            )}

            {showCancelledAfter && (
              <li key="CANCELLED" className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <Ban className="size-4" />
                  </span>
                </div>
                <div className="pt-0.5 pb-0">
                  <p className="text-destructive text-sm font-medium">
                    Order cancelled
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(o.cancelledAt) ??
                      "This order was cancelled and will not be delivered."}
                  </p>
                  {o.cancelReason ? (
                    <p className="text-muted-foreground mt-0.5 text-xs italic">
                      {o.cancelReason}
                    </p>
                  ) : null}
                </div>
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}
