"use client"

import {
  Banknote,
  CheckCircle2,
  MapPin,
  Navigation,
  PackageCheck,
  PartyPopper,
  Phone,
  Truck,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderLabelButton } from "@/features/orders/components/order-label-button"
import { DeliveryAttemptDialog } from "@/features/orders/dialogs/delivery-attempt-dialog"
import { OutForDeliveryDialog } from "@/features/orders/dialogs/out-for-delivery-dialog"
import { OutForPickupDialog } from "@/features/orders/dialogs/out-for-pickup-dialog"
import { PickupConfirmDialog } from "@/features/orders/dialogs/pickup-confirm-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { usePublishedLabelTemplate } from "@/features/platform-config/hooks/use-label-template"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { formatTk } from "@/lib/pricing"
import { businessDateString, businessToday } from "@/lib/timezone"
import type { Order } from "@/lib/types"

function isToday(iso?: string | null) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  // Compare business-local calendar days, not the device's: a
  // parcel delivered at 23:30 Dhaka is still "today" for the rider even when
  // the browser's clock has rolled into another day.
  return businessDateString(d) === businessToday()
}

function TaskSection({
  title,
  count,
  viewAllHref,
  children,
}: {
  title: string
  count: number
  viewAllHref?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-border mb-3 flex items-center justify-between border-b px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <Badge variant="secondary">{count}</Badge>
          </div>
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              View queue
            </Link>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export default function RiderTodoPage() {
  const { currentUser } = useAuth()
  const { currentRider } = useRiders()
  const { orders } = useOrders()
  const { merchants } = useMerchants()
  const { pickupLocations } = usePickupLocations()
  // The published parcel label, so the rider's print action matches the designer.
  const { template: labelTemplate } = usePublishedLabelTemplate()

  const [pickupTarget, setPickupTarget] = useState<Order | null>(null)
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false)
  const [deliveryTarget, setDeliveryTarget] = useState<Order | null>(null)
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false)
  const [startTarget, setStartTarget] = useState<Order | null>(null)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [startPickupTarget, setStartPickupTarget] = useState<Order | null>(null)
  const [startPickupDialogOpen, setStartPickupDialogOpen] = useState(false)

  const merchant = (id: string) => merchants.find((m) => m.id === id)
  const merchantName = (id: string) => merchant(id)?.businessName ?? "Merchant"
  const pickup = (id: string) => pickupLocations.find((p) => p.id === id)

  const myPickups = useMemo(
    () =>
      currentRider
        ? orders.filter((o) => o.pickupRiderId === currentRider.id)
        : [],
    [orders, currentRider],
  )
  const myDeliveries = useMemo(
    () =>
      currentRider
        ? orders.filter((o) => o.deliveryRiderId === currentRider.id)
        : [],
    [orders, currentRider],
  )

  // Both pre-collection states belong in the queue: APPROVED is waiting to be
  // started, OUT_FOR_PICKUP is started and waiting to be completed. Filtering
  // on APPROVED alone would drop a parcel the moment the rider taps the button.
  const toPickup = myPickups.filter((o) =>
    ["APPROVED", "OUT_FOR_PICKUP"].includes(o.status),
  )
  const toDeliver = myDeliveries.filter((o) =>
    ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(o.status),
  )

  const deliveredTodayCount = myDeliveries.filter(
    (o) => o.status === "DELIVERED" && isToday(o.deliveredAt),
  ).length

  const pickedUpTodayCount = myPickups.filter(
    (o) => o.status === "PICKED_UP" && isToday(o.pickedUpAt),
  ).length

  const cashToSubmit = myDeliveries
    .filter(
      (o) =>
        o.status === "DELIVERED" &&
        !o.codSettledAt &&
        o.deliveryRiderId === currentRider?.id,
    )
    .reduce((sum, o) => sum + o.productCost, 0)

  const cashCollected = myDeliveries.filter(
    (o) =>
      o.status === "DELIVERED" &&
      !o.codSettledAt &&
      o.deliveryRiderId === currentRider?.id,
  )

  const totalTasks = toPickup.length + toDeliver.length

  function openPickup(order: Order) {
    setPickupTarget(order)
    setPickupDialogOpen(true)
  }

  function openDelivery(order: Order) {
    setDeliveryTarget(order)
    setDeliveryDialogOpen(true)
  }

  function openStartDelivery(order: Order) {
    setStartTarget(order)
    setStartDialogOpen(true)
  }

  function openStartPickup(order: Order) {
    setStartPickupTarget(order)
    setStartPickupDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.rider.todo.title(
          currentUser?.name.split(" ")[0] ?? "Rider",
        )}
        description={pageContent.rider.todo.description}
      />

      <StatCardList
        columns={3}
        items={[
          {
            label: "Pickup progress",
            value: `${pickedUpTodayCount} / ${toPickup.length}`,
            icon: PackageCheck,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: "Delivery progress",
            value: `${deliveredTodayCount} / ${toDeliver.length}`,
            icon: Truck,
            tone: "bg-chart-4/15 text-chart-4",
          },
          {
            label: statCardLabels.rider.todo.cashToSubmit.label,
            value: formatTk(cashToSubmit),
            icon: Banknote,
            tone: "bg-chart-3/15 text-chart-3",
          },
        ]}
      />

      {totalTasks === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PartyPopper className="text-chart-2 size-8" />
            <p className="font-medium">All caught up</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              No pending pickups or deliveries right now. New tasks will show up
              here as soon as they&apos;re assigned to you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <TaskSection
            title="Pick up from merchant"
            count={toPickup.length}
            viewAllHref="/rider/pickup"
          >
            <div className="flex flex-col">
              {toPickup.map((o) => {
                const p = pickup(o.pickupLocationId)
                const mapLink = o.pickupLocationMapLink ?? null
                const phone = o.merchantPhone ?? null
                return (
                  <div
                    key={o.id}
                    className="flex flex-col gap-3 border-border border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="flex flex-1 flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {o.id}
                        </span>
                        <span className="text-muted-foreground text-xs">•</span>
                        <span className="truncate text-sm font-medium">
                          {merchantName(o.merchantId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            className="hover:text-foreground active:text-foreground inline-flex shrink-0 items-center gap-1"
                          >
                            <Phone className="size-3" />
                            {phone}
                          </a>
                        )}
                        {p?.address && (
                          <span className="min-w-0 truncate">{p.address}</span>
                        )}
                      </div>
                    </div>
                    {/* Full-width on a phone: the primary action is the whole
                        point of the row, and a rider taps it one-handed. */}
                    <div className="flex w-full items-center gap-3 sm:w-auto sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!mapLink}
                        aria-label="Open pickup location in maps"
                        onClick={() => {
                          if (mapLink) window.open(mapLink, "_blank")
                        }}
                      >
                        <MapPin className="size-4" />
                      </Button>
                      {o.status === "APPROVED" ? (
                        <Button
                          size="default"
                          className="flex-1 sm:flex-none"
                          onClick={() => openStartPickup(o)}
                          data-testid={`rider-start-pickup-${o.id}`}
                        >
                          <Navigation className="size-4" />
                          Out for pickup
                        </Button>
                      ) : (
                        // Reachable only at OUT_FOR_PICKUP: the `picked-up`
                        // transition refuses anything else, so offering the
                        // button any earlier would just produce a 400 toast.
                        <Button
                          size="default"
                          className="flex-1 sm:flex-none"
                          onClick={() => openPickup(o)}
                          data-testid={`rider-picked-up-${o.id}`}
                        >
                          <PackageCheck className="size-4" />
                          Picked up
                        </Button>
                      )}
                      <OrderLabelButton
                        order={o}
                        merchantName={merchantName(o.merchantId)}
                        template={labelTemplate}
                        variant="outline"
                        showDownload={false}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </TaskSection>

          <TaskSection
            title="Deliver to recipient"
            count={toDeliver.length}
            viewAllHref="/rider/delivery"
          >
            <div className="flex flex-col">
              {toDeliver.map((o) => {
                const isAssigned = o.deliveryRiderId === currentRider?.id
                const canStart = o.status === "IN_TRANSIT" && isAssigned
                const canRecord = o.status === "OUT_FOR_DELIVERY" && isAssigned
                const mapLink = o.deliveryMapLink ?? null
                return (
                  <div
                    key={o.id}
                    className="flex flex-col gap-3 border-border border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="flex flex-1 flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {o.id}
                        </span>
                        <span className="text-muted-foreground text-xs">•</span>
                        <span className="truncate text-sm font-medium">
                          {o.recipientName}
                        </span>
                        {/* COD is data, not an action — it belongs with the
                            parcel, not in the tap row. */}
                        <span className="ml-auto shrink-0 text-sm font-medium tabular-nums sm:ml-0">
                          {formatTk(o.productCost)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {o.recipientPhone && (
                          <a
                            href={`tel:${o.recipientPhone}`}
                            className="hover:text-foreground active:text-foreground inline-flex shrink-0 items-center gap-1"
                          >
                            <Phone className="size-3" />
                            {o.recipientPhone}
                          </a>
                        )}
                        {o.deliveryCity && (
                          <span className="shrink-0">{o.deliveryCity}</span>
                        )}
                        {o.deliveryAddress && (
                          <span className="min-w-0 truncate">
                            — {o.deliveryAddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex w-full items-center gap-3 sm:w-auto sm:shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!mapLink}
                        aria-label="Open delivery location in maps"
                        onClick={() => {
                          if (mapLink) window.open(mapLink, "_blank")
                        }}
                      >
                        <MapPin className="size-4" />
                      </Button>
                      {canStart && (
                        <Button
                          size="default"
                          className="flex-1 sm:flex-none"
                          onClick={() => openStartDelivery(o)}
                        >
                          <Navigation className="size-4" />
                          Start
                        </Button>
                      )}
                      {canRecord && (
                        <Button
                          size="default"
                          className="flex-1 sm:flex-none"
                          onClick={() => openDelivery(o)}
                        >
                          <CheckCircle2 className="size-4" />
                          Record
                        </Button>
                      )}
                      <OrderLabelButton
                        order={o}
                        merchantName={merchantName(o.merchantId)}
                        template={labelTemplate}
                        variant="outline"
                        showDownload={false}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </TaskSection>
        </div>
      )}

      {cashCollected.length > 0 && (
        <TaskSection title="Cash collected" count={cashCollected.length}>
          <div className="flex flex-col">
            {cashCollected.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 border-border border-b px-4 py-3 last:border-b-0 sm:px-5"
              >
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">
                      {o.id}
                    </span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="truncate text-sm font-medium">
                      {o.recipientName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {o.deliveryCity && <span>{o.deliveryCity}</span>}
                    {o.deliveryAddress && (
                      <span className="truncate">— {o.deliveryAddress}</span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium tabular-nums shrink-0">
                  {formatTk(o.productCost)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-border border-t px-4 py-3 sm:px-5">
              <span className="text-sm font-semibold">Total to submit</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatTk(cashToSubmit)}
              </span>
            </div>
          </div>
        </TaskSection>
      )}

      <PickupConfirmDialog
        order={pickupTarget}
        merchantName={
          pickupTarget
            ? (merchant(pickupTarget.merchantId)?.businessName ?? "Merchant")
            : ""
        }
        pickupLocation={
          pickupTarget ? (pickup(pickupTarget.pickupLocationId) ?? null) : null
        }
        open={pickupDialogOpen}
        onOpenChange={setPickupDialogOpen}
      />

      <OutForPickupDialog
        order={startPickupTarget}
        open={startPickupDialogOpen}
        onOpenChange={setStartPickupDialogOpen}
      />

      <OutForDeliveryDialog
        order={startTarget}
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
      />

      <DeliveryAttemptDialog
        order={deliveryTarget}
        open={deliveryDialogOpen}
        onOpenChange={setDeliveryDialogOpen}
      />
    </div>
  )
}
