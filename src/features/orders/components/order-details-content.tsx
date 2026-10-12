"use client"

import {
  Bike,
  CalendarDays,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  Store,
  User,
  Warehouse as WarehouseIcon,
  Weight,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge"
import { SetExpectedDeliveryDialog } from "@/features/orders/dialogs/set-expected-delivery-dialog"
import { exceedsLaneWeightLimit } from "@/features/orders/lane-weight"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import {
  BADGE_TONES,
  type BadgeTone,
  CURRENCY_SUFFIX,
  ORDER_DELIVERY_TYPE_LABELS,
} from "@/lib/constants"
import { deliveryOutcome } from "@/lib/delivery-promise"
import { formatDateTime } from "@/lib/format"
import { deliveryProgress } from "@/lib/order-timeline"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Icon-chip tints, keyed by field role.
 *
 * Drawn from `BADGE_TONES` so a field chip agrees with the status badge and the
 * notification icons beside it — one palette, not three. The chip is a filled
 * circle with no border, so the border half of each tone is dropped; the `dark:`
 * overrides are kept, since dropping those would leave, say, green-600 text on
 * a dark background.
 */
type IconComponent = React.ComponentType<{ className?: string }>

// A Map rather than a record literal: `Field` receives either a function or a
// class component depending on the icon, and TypeScript will not index a record
// with that union. Component identity is the key either way — never the display
// name, which is a debugging aid and can be minified away.
const FIELD_CHIP_TONES = new Map<IconComponent, BadgeTone>([
  [User, "info"],
  [Phone, "info"],
  [Mail, "neutral"],
  [MapPin, "brand"],
  [Store, "pending"],
  [ExternalLink, "violet"],
  [Weight, "violet"],
  [Package, "brand"],
  [Bike, "transit"],
  [WarehouseIcon, "warehouse"],
  [CalendarDays, "neutral"],
])

function chipTint(tone: BadgeTone | undefined): string {
  const key = tone ?? "neutral"
  return BADGE_TONES[key]
    .split(" ")
    .filter((c) => !c.includes("border"))
    .join(" ")
}

function Field({
  icon: Icon,
  label,
  value,
  className,
  testId,
  tone,
}: {
  icon: IconComponent
  label: string
  value: React.ReactNode
  className?: string
  /**
   * Test hook. A label/value pair has no natural id, and a spec reading the
   * label's text would break on any copy edit — so the row can carry one.
   * Same reasoning as `DetailRow` on the public tracking page.
   */
  testId?: string
  /** Chip tint. Falls back to the icon's own entry, then to neutral. */
  tone?: BadgeTone
}) {
  return (
    <div
      className={cn("flex items-start gap-3", className)}
      data-testid={testId}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
          chipTint(tone ?? FIELD_CHIP_TONES.get(Icon)),
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground mb-0.5 text-[11px] font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  )
}

/**
 * Section heading accents.
 *
 * Five cards stacked with a 1px gutter already read as one surface, which left
 * the eye with no cue for where one group ends and the next begins. A short
 * tinted rule beside the heading gives that boundary back without adding another
 * border — and reuses `BADGE_TONES`, so it agrees with the chips inside it.
 */
const SECTION_TONES: Record<string, BadgeTone> = {
  "Recipient & delivery": "info",
  "Merchant & pickup": "pending",
  Parcel: "violet",
  Notes: "neutral",
  Payment: "brand",
}

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  const tone = SECTION_TONES[title] ?? "neutral"
  return (
    <div className={cn("", className)}>
      <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase">
        <span
          aria-hidden
          className={cn(
            "h-3.5 w-1 shrink-0 rounded-full",
            chipTint(tone)
              .split(" ")
              .find((c) => c.startsWith("bg-")),
          )}
        />
        <span className="text-muted-foreground">{title}</span>
      </p>
      {children}
    </div>
  )
}

export function OrderDetailsContent({ order }: { order: Order }) {
  const { currentUser } = useAuth()
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const { warehouses } = useWarehouses()
  const { pickupLocations } = usePickupLocations()
  const [dateDialogOpen, setDateDialogOpen] = useState(false)

  // Only the two roles the transition authorises can see the control — the
  // server refuses anyone else anyway, so hiding it keeps the button from
  // offering an action that will 403. Delivered parcels are excluded for the
  // same reason: the date is final.
  const canSetDate =
    (currentUser?.role === "SUPER_ADMIN" ||
      currentUser?.role === "WAREHOUSE_ADMIN") &&
    !order.deliveredAt

  const merchant = merchants.find((m) => m.id === order.merchantId)
  const pickupLocation = pickupLocations.find(
    (p) => p.id === order.pickupLocationId,
  )
  const pickupRider = riders.find((r) => r.id === order.pickupRiderId)
  const deliveryRider = riders.find((r) => r.id === order.deliveryRiderId)
  const warehouse = warehouses.find((w) => w.id === order.warehouseId)
  // The weight limit belongs to the route, so "over limit" is a property of the
  // lane this order is on — not of the merchant. Resolved through the same
  // lookup `resolveRoutePricing` uses server-side.
  const { cities: deliveryCities } = useDeliveryCities()
  const { pricing: zonePricing } = useZonePricingPublic()
  const exceedsWeight = exceedsLaneWeightLimit(
    {
      warehouseId: order.warehouseId,
      deliveryCityId: order.deliveryCityId,
      parcelWeightKg: order.parcelWeightKg,
    },
    { warehouses, deliveryCities, zonePricing },
  )

  // The promise and how the parcel actually did against it — both snapshotted on
  // the order, so this reads the same numbers the merchant and the recipient see.
  const outcome = deliveryOutcome(
    order.actualDeliveryDays,
    order.expectedDeliveryDays,
  )
  const isLate =
    typeof order.actualDeliveryDays === "number" &&
    typeof order.expectedDeliveryDays === "number" &&
    order.actualDeliveryDays > order.expectedDeliveryDays

  // Same numbers the public tracking page shows — one function, so the ops
  // screen and the recipient's screen can never disagree about how far along a
  // parcel is.
  const progress = deliveryProgress(order.status)

  return (
    <div className="flex flex-col gap-6">
      {/* Stacked panels. The `space-y-px` gutter plus the rounded top/bottom
          on the first and last card is what makes five separate bordered cards
          read as one grouped surface. The wrapper used to also declare a 3-column
          grid holding a single `col-span-3` child, which did nothing. */}
      <div className="space-y-px">
        {/* Recipient & delivery */}
        <div className="bg-card border-border rounded-t-xl border p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-2xl font-semibold tracking-tight">
                {order.id}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Placed{" "}
                {formatDateTime(order.createdAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              {order.expectedDeliveryAt && (
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Expected by </span>
                  <span className="font-medium">
                    {formatDateTime(order.expectedDeliveryAt, {
                      dateStyle: "medium",
                    })}
                  </span>
                  {outcome && (
                    <span
                      className={
                        isLate
                          ? "text-destructive ml-1.5 font-medium"
                          : "text-muted-foreground ml-1.5"
                      }
                    >
                      · {outcome}
                    </span>
                  )}
                </p>
              )}
              {progress.visible && (
                <div className="mt-4 max-w-md" data-testid="order-progress">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground font-medium">
                      Delivery progress
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      Step {progress.step} of {progress.total}
                    </span>
                  </div>
                  <Progress
                    value={progress.percent}
                    aria-label="Delivery progress"
                  />
                </div>
              )}
              <Link
                href={`/track/${order.trackingToken ?? order.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary mt-3 inline-flex items-center gap-1 text-xs hover:underline"
              >
                <ExternalLink className="size-3" />
                Public tracking
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {canSetDate && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="set-expected-delivery-open"
                  onClick={() => setDateDialogOpen(true)}
                >
                  <CalendarDays className="size-4" />
                  Set date
                </Button>
              )}
              <OrderStatusBadge status={order.status} size="md" />
            </div>
          </div>
          <Section title="Recipient & delivery">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                icon={User}
                label="Recipient"
                value={order.recipientName}
              />
              <Field icon={Phone} label="Phone" value={order.recipientPhone} />
              {/* Only when one was collected. An em-dash on every legacy
                    order would teach readers to skip the row — the same reason
                    `itemType` renders conditionally. Personal data: this is the
                    merchant/staff surface only, never the public track page. */}
              {order.recipientMail ? (
                <Field
                  icon={Mail}
                  label="Email"
                  testId="recipient-mail"
                  value={
                    <a
                      href={`mailto:${order.recipientMail}`}
                      className="text-primary break-all hover:underline"
                    >
                      {order.recipientMail}
                    </a>
                  }
                />
              ) : null}
              <Field
                icon={MapPin}
                label="Delivery map link"
                value={
                  order.deliveryMapLink?.trim() ? (
                    <a
                      href={order.deliveryMapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 text-sm break-all hover:underline"
                    >
                      <ExternalLink className="size-3.5 shrink-0" />
                      Open in maps
                    </a>
                  ) : (
                    <span className="text-muted-foreground font-normal">—</span>
                  )
                }
              />
              {/* Last, and spanning the row: the address is the longest value
                    on the card, and putting it at the end of an even 2-column
                    run keeps every row filled instead of stranding one cell. */}
              <Field
                icon={MapPin}
                label="Delivery address"
                value={
                  <div className="flex flex-col">
                    {order.deliveryCity && (
                      <span className="font-medium">{order.deliveryCity}</span>
                    )}
                    <span>{order.deliveryAddress || "—"}</span>
                  </div>
                }
                className="sm:col-span-2"
              />
            </div>
          </Section>
        </div>

        {/* Merchant & pickup */}
        <div className="bg-card border-border border p-6">
          <Section title="Merchant & pickup">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                icon={Store}
                label="Merchant"
                value={merchant?.businessName ?? "Unknown"}
              />
              <Field
                icon={Phone}
                label="Merchant phone"
                value={merchant?.phone || "—"}
              />
              <Field
                icon={MapPin}
                label="Pickup address"
                value={pickupLocation?.address || "—"}
                className="sm:col-span-2"
              />
              <Field
                icon={ExternalLink}
                label="Pickup map link"
                value={
                  pickupLocation?.mapLink?.trim() ? (
                    <a
                      href={pickupLocation.mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1.5 text-sm break-all hover:underline"
                    >
                      <ExternalLink className="size-3.5 shrink-0" />
                      Open in maps
                    </a>
                  ) : (
                    <span className="text-muted-foreground font-normal">—</span>
                  )
                }
              />
            </div>
          </Section>
        </div>

        {/* Parcel */}
        <div className="bg-card border-border border p-6">
          <Section title="Parcel">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                icon={Weight}
                label="Weight"
                value={
                  <span className={exceedsWeight ? "text-destructive" : ""}>
                    {order.parcelWeightKg} kg
                    {exceedsWeight ? " · exceeds limit" : ""}
                  </span>
                }
              />
              {/* Only when the merchant said something. A permanently empty
                    "Contents" field on every legacy order is noise that trains
                    readers to skip the row that actually has a value. */}
              {order.itemType ? (
                <Field icon={Package} label="Contents" value={order.itemType} />
              ) : null}
              <Field
                icon={Package}
                label="Delivery type"
                value={ORDER_DELIVERY_TYPE_LABELS[order.deliveryType]}
              />
              <Field
                icon={Bike}
                label="Pickup rider"
                value={
                  pickupRider ? (
                    <div className="leading-tight">
                      <p>{pickupRider.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {pickupRider.phone}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground font-normal">
                      Not assigned
                    </span>
                  )
                }
              />
              <Field
                icon={WarehouseIcon}
                label="Delivery rider / hub"
                value={
                  deliveryRider ? (
                    <div className="leading-tight">
                      <p>{deliveryRider.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {deliveryRider.phone}
                      </p>
                      {warehouse && (
                        <p className="text-muted-foreground text-xs">
                          {warehouse.name}
                        </p>
                      )}
                    </div>
                  ) : warehouse ? (
                    <span>{warehouse.name}</span>
                  ) : (
                    <span className="text-muted-foreground font-normal">
                      Not assigned
                    </span>
                  )
                }
              />
            </div>
          </Section>
        </div>

        {/* Notes */}
        <div className="bg-card border-border border p-6">
          <Section title="Notes">
            <div className="space-y-4">
              <div>
                <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                  Note from merchant
                </p>
                <p className="text-sm leading-relaxed">
                  {order.merchantNote || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                  Note from recipient
                </p>
                <p className="text-sm leading-relaxed">
                  {order.receiverNote || "—"}
                </p>
              </div>
            </div>
          </Section>
        </div>

        {/* Payment */}
        <div className="bg-card border-border rounded-b-xl border p-6 pb-0">
          <Section title="Payment">
            <div className="space-y-0">
              {[
                { label: "COD amount", amount: order.productCost },
                { label: "Delivery fee", amount: order.deliveryFee },
                { label: "COD fee", amount: order.codFee },
                ...(order.status === "RETURNED"
                  ? [
                      {
                        label: "Cancellation fee",
                        amount: order.cancellationFee,
                      },
                    ]
                  : []),
              ].map(({ label, amount }) => (
                <div
                  key={label}
                  className="border-border/50 flex items-center justify-between border-b py-3 text-sm last:border-0"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{formatTk(amount)}</span>
                </div>
              ))}
              <div className="bg-muted/50 -mx-6 mt-3 flex items-center justify-between rounded-b-xl px-6 py-3.5">
                <span className="text-sm font-medium">
                  Recipient pays (COD)
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {formatTk(order.productCost)}
                </span>
              </div>
            </div>
            {order.amountCollected != null && (
              <p className="text-muted-foreground mt-3 text-xs">
                Collected: {order.amountCollected} {CURRENCY_SUFFIX}
                {order.codSettledAt ? " · COD settled" : ""}
              </p>
            )}
            {order.status === "RETURNED" && (
              <p className="text-muted-foreground mt-3 text-xs">
                Returned — delivery and COD fees refunded; only the cancellation
                fee applies.
              </p>
            )}
          </Section>
        </div>
      </div>

      <SetExpectedDeliveryDialog
        order={order}
        open={dateDialogOpen}
        onOpenChange={setDateDialogOpen}
      />
    </div>
  )
}
