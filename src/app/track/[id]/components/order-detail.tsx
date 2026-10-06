import {
  Ban,
  Banknote,
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock,
  HandCoins,
  type LucideIcon,
  MapPin,
  PackageCheck,
  Search,
  StickyNote,
  Store,
  Truck,
  Undo2,
  User,
  Warehouse,
  Weight,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { ReceiverNoteWidget } from "@/features/orders/components/receiver-note-widget"
import { deliveryOutcome } from "@/lib/delivery-promise"
import { deliveryProgress } from "@/lib/order-timeline"
import { formatTk } from "@/lib/pricing"
import type { OrderStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  type fetchOrderData,
  formatStamp,
  generalArea,
  maskPhone,
  STATUS_COPY,
} from "../lib"
import { Timeline } from "./timeline"

// ─── status presentation ──────────────────────────────────────────────────────

const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  PENDING: Clock,
  APPROVED: PackageCheck,
  OUT_FOR_PICKUP: Bike,
  PICKED_UP: Bike,
  IN_WAREHOUSE: Warehouse,
  IN_TRANSIT: Truck,
  OUT_FOR_DELIVERY: Truck,
  DELIVERED: CheckCircle2,
  FAILED_ATTEMPT: XCircle,
  RETURNED: Undo2,
  CANCELLED: Ban,
}

const STATUS_TINT: Record<OrderStatus, string> = {
  PENDING: "bg-chart-3/10 text-chart-3 ring-chart-3/20",
  APPROVED: "bg-chart-1/10 text-chart-1 ring-chart-1/20",
  OUT_FOR_PICKUP: "bg-chart-1/10 text-chart-1 ring-chart-1/20",
  PICKED_UP: "bg-chart-1/10 text-chart-1 ring-chart-1/20",
  IN_WAREHOUSE: "bg-chart-2/10 text-chart-2 ring-chart-2/20",
  IN_TRANSIT: "bg-chart-4/10 text-chart-4 ring-chart-4/20",
  OUT_FOR_DELIVERY: "bg-chart-4/10 text-chart-4 ring-chart-4/20",
  DELIVERED: "bg-chart-2/10 text-chart-2 ring-chart-2/20",
  FAILED_ATTEMPT: "bg-destructive/10 text-destructive ring-destructive/20",
  RETURNED: "bg-muted text-muted-foreground ring-border",
  CANCELLED: "bg-destructive/10 text-destructive ring-destructive/20",
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
  testId,
}: {
  icon: LucideIcon
  label: string
  value: string
  mono?: boolean
  /**
   * Test hook. A label/value pair has no natural id, and a spec reading the
   * label's text would break on any copy edit — so the row can carry one.
   */
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-start justify-between gap-4 py-2.5"
    >
      <dt className="text-muted-foreground inline-flex items-center gap-2 text-xs">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </dt>
      <dd
        className={cn(
          "text-right text-xs font-medium",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

// ─── order detail ─────────────────────────────────────────────────────────────

export function OrderDetail({
  order: o,
  merchant: merchantData,
  pickupRider,
  deliveryRider,
  warehouse: warehouseData,
  matchedByToken,
  minimal = false,
}: NonNullable<Awaited<ReturnType<typeof fetchOrderData>>> & {
  minimal?: boolean
}) {
  const statusInfo = STATUS_COPY[o.status]
  const StatusIcon = STATUS_ICON[o.status]
  const tint = STATUS_TINT[o.status]

  const progress = deliveryProgress(o.status)
  const placedAt = formatStamp(o.createdAt)
  // The promise, and how the parcel did against it. Both are snapshotted on the
  // order, so the recipient reads the same numbers the hub does — and `null`
  // (no promise configured, or not yet delivered) renders as "not shown" rather
  // than as a zero-day promise.
  const outcome = deliveryOutcome(o.actualDeliveryDays, o.expectedDeliveryDays)

  return (
    <div className="space-y-4">
      {/* ── Status hero ── */}
      <section className="bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1",
              tint,
            )}
          >
            <StatusIcon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2
                className={cn(
                  "text-xl font-semibold tracking-tight",
                  statusInfo.color,
                )}
              >
                {statusInfo.headline}
              </h2>
              <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-xs">
                {o.id}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {statusInfo.sub}
            </p>
          </div>
        </div>

        {/* Progress */}
        {progress.visible && (
          <div className="border-border/60 border-t px-5 py-4 sm:px-6">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground font-medium">
                Delivery progress
              </span>
              <span className="text-muted-foreground tabular-nums">
                Step {progress.step} of {progress.total}
              </span>
            </div>
            <div
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-label="Delivery progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta strip */}
        <dl className="border-border/60 grid grid-cols-1 gap-x-6 gap-y-3 border-t px-5 py-4 sm:grid-cols-3 sm:px-6">
          {merchantData && (
            <div className="flex min-w-0 items-center gap-2">
              <Store className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0">
                <dt className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  From
                </dt>
                <dd className="truncate text-xs font-medium">
                  {merchantData.businessName}
                </dd>
              </div>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0">
              <dt className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Deliver to
              </dt>
              <dd className="truncate text-xs font-medium">{generalArea(o)}</dd>
            </div>
          </div>
          {placedAt && (
            <div className="flex min-w-0 items-center gap-2">
              <Clock className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0">
                <dt className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  Placed
                </dt>
                <dd className="truncate text-xs font-medium tabular-nums">
                  {placedAt}
                </dd>
              </div>
            </div>
          )}
        </dl>
      </section>

      {/* ── Timeline + sidebar ── */}
      <div
        className={
          minimal
            ? "grid gap-4"
            : "grid gap-4 lg:grid-cols-[1.55fr_1fr] lg:items-start"
        }
      >
        <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
          <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-widest uppercase">
            Delivery timeline
          </p>
          <Timeline
            order={o}
            pickupRider={pickupRider}
            warehouse={warehouseData}
            deliveryRider={deliveryRider}
            minimal={minimal}
          />
        </section>

        {/* Code lookups (minimal) hide shipment details and the merchant note -
            status and area only. The PII-free locked note hint stays so the
            recipient still learns how to leave a note. */}
        <aside className="space-y-4">
          {!minimal && (
            <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
              <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Shipment details
              </p>
              <dl className="divide-border/60 mt-2 divide-y">
                {o.expectedDeliveryAt && (
                  <DetailRow
                    icon={CalendarDays}
                    label="Expected by"
                    testId="track-expected-by"
                    // `formatStamp` is null-safe and can return null for junk;
                    // the field is non-null here, but the em-dash keeps the type
                    // honest rather than asserting something TS cannot see.
                    value={formatStamp(o.expectedDeliveryAt) ?? "—"}
                  />
                )}
                {outcome && (
                  <DetailRow
                    icon={Clock}
                    label="Outcome"
                    testId="track-outcome"
                    value={outcome}
                  />
                )}
                <DetailRow
                  icon={User}
                  label="Recipient"
                  value={`${o.recipientName.split(" ")[0]} · ${maskPhone(o.recipientPhone)}`}
                />
                <DetailRow
                  icon={Weight}
                  label="Weight"
                  value={`${o.parcelWeightKg} kg`}
                />
                <DetailRow
                  icon={Truck}
                  label="Handling"
                  value={o.deliveryType === "FRAGILE" ? "Fragile" : "Standard"}
                />
                <DetailRow
                  icon={HandCoins}
                  label="Cash on delivery"
                  value={formatTk(o.productCost)}
                  mono
                />
                <DetailRow
                  icon={Banknote}
                  label="Delivery fee"
                  value={formatTk(o.deliveryFee)}
                  mono
                />
              </dl>
            </section>
          )}

          {/* Merchant note (read-only) */}
          {!minimal && o.merchantNote && (
            <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <StickyNote className="text-muted-foreground size-4" />
                <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                  Note from merchant
                </p>
              </div>
              <p className="text-sm leading-relaxed">{o.merchantNote}</p>
            </section>
          )}

          {/* Receiver note widget - lets the recipient leave a delivery
              instruction. The write capability requires the tracking token,
              so it is only handed to the client when the page was
              opened via the token link. */}
          <ReceiverNoteWidget
            orderId={o.id}
            initialNote={o.receiverNote}
            isTerminal={
              o.status === "DELIVERED" ||
              o.status === "RETURNED" ||
              o.status === "CANCELLED"
            }
            trackingToken={matchedByToken ? o.trackingToken : null}
          />
        </aside>
      </div>

      {/* Search again */}
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
