"use client"

import {
  Bike,
  ExternalLink,
  MapPin,
  Package,
  Phone,
  Store,
  User,
  Warehouse as WarehouseIcon,
  Weight,
} from "lucide-react"
import Link from "next/link"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge"
import { exceedsLaneWeightLimit } from "@/features/orders/lane-weight"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { CURRENCY_SUFFIX, ORDER_DELIVERY_TYPE_LABELS } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"

function Field({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
        <Icon className="text-muted-foreground size-3.5" />
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

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("", className)}>
      <p className="text-muted-foreground mb-4 text-[11px] font-semibold tracking-widest uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}

export function OrderDetailsContent({ order }: { order: Order }) {
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const { warehouses } = useWarehouses()
  const { pickupLocations } = usePickupLocations()

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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className={`space-y-px lg:col-span-3`}>
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
                <Link
                  href={`/track/${order.trackingToken ?? order.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                >
                  <ExternalLink className="size-3" />
                  Public tracking
                </Link>
              </div>
              <OrderStatusBadge status={order.status} size="md" />
            </div>
            <Section title="Recipient & delivery">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field
                  icon={User}
                  label="Recipient"
                  value={order.recipientName}
                />
                <Field
                  icon={Phone}
                  label="Phone"
                  value={order.recipientPhone}
                />
                <Field
                  icon={MapPin}
                  label="Delivery address"
                  value={
                    <div className="flex flex-col">
                      {order.deliveryCity && (
                        <span className="font-medium">
                          {order.deliveryCity}
                        </span>
                      )}
                      <span>{order.deliveryAddress || "—"}</span>
                    </div>
                  }
                  className="sm:col-span-2"
                />
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
                      <span className="text-muted-foreground font-normal">
                        —
                      </span>
                    )
                  }
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
                      <span className="text-muted-foreground font-normal">
                        —
                      </span>
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
                  <Field
                    icon={Package}
                    label="Contents"
                    value={order.itemType}
                  />
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
                  Returned — delivery and COD fees refunded; only the
                  cancellation fee applies.
                </p>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
