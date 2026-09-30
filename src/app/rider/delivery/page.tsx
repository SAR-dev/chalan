"use client"

import { CheckCircle2, MapPin, Navigation } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { DateRangePicker } from "@/components/date-range-picker"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { riderParcelColumn } from "@/features/orders/components/order-table-columns"
import { DeliveryAttemptDialog } from "@/features/orders/dialogs/delivery-attempt-dialog"
import { OrderDetailsDialog } from "@/features/orders/dialogs/order-details-dialog"
import { OutForDeliveryDialog } from "@/features/orders/dialogs/out-for-delivery-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

function PhoneLink({ phone }: { phone?: string }) {
  if (!phone) return null
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => e.stopPropagation()}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs tabular-nums"
    >
      {phone}
    </a>
  )
}

export default function RiderDeliveryQueuePage() {
  const { currentUser } = useAuth()
  const { currentRider } = useRiders()
  const {
    orders,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    isLoading,
    isRefreshing,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    mutate: refresh,
  } = useOrders()
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [startTarget, setStartTarget] = useState<Order | null>(null)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [setPage])

  const myDeliveries = useMemo(
    () =>
      currentRider
        ? orders.filter((o) => o.deliveryRiderId === currentRider.id)
        : [],
    [orders, currentRider],
  )

  const dateFilterLabel =
    dateFrom || dateTo
      ? `Filtered: ${dateFrom ?? "start"} to ${dateTo ?? "now"}`
      : null

  function openAttempt(order: Order) {
    setActiveOrder(order)
    setDialogOpen(true)
  }

  function openStartDelivery(order: Order) {
    setStartTarget(order)
    setStartDialogOpen(true)
  }

  const columns: DataTableColumn<Order>[] = [
    {
      id: "order",
      header: columnLabels.rider.order,
      sortValue: (o) => o.id,
      cell: (o) => (
        <button
          type="button"
          onClick={() => {
            setViewOrderCode(o.id)
            setViewOpen(true)
          }}
          className="font-mono text-xs font-medium text-left text-primary underline-offset-2 hover:underline focus:outline-none"
        >
          {o.id}
        </button>
      ),
    },
    {
      id: "receiver",
      header: columnLabels.rider.contact,
      sortValue: (o) => o.recipientName,
      cell: (o) => (
        <div className="flex flex-col">
          <span className="font-medium">{o.recipientName}</span>
          <PhoneLink phone={o.recipientPhone} />
        </div>
      ),
    },
    // Weight and contents: on a delivery the rider may be asked to hand over
    // cash, take a return, or refuse a visibly wrong item — all of which need
    // to know what the parcel is before they knock.
    riderParcelColumn(),
    {
      id: "destination",
      header: columnLabels.rider.destination,
      sortValue: (o) =>
        [o.deliveryCity, o.deliveryAddress].filter(Boolean).join(", "),
      cell: (o) => (
        <div className="flex flex-col">
          <span className="underline decoration-dotted underline-offset-4">
            {o.deliveryCity}
          </span>
          <span className="text-muted-foreground text-xs">
            {o.deliveryAddress}
          </span>
        </div>
      ),
    },
    {
      id: "deliveryMapLink",
      header: columnLabels.rider.mapLink,
      align: "center",
      cell: (o) => {
        const mapLink = o.deliveryMapLink ?? null
        return mapLink ? (
          <a
            href={mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center size-8 rounded-md hover:bg-accent"
          >
            <MapPin className="size-4" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      id: "collectible",
      header: columnLabels.order.collectible,
      align: "right",
      sortValue: (o) => formatTk(o.productCost),
      cell: (o) => (
        <span className="tabular-nums">{formatTk(o.productCost)}</span>
      ),
    },
    {
      id: "status",
      header: columnLabels.order.status,
      sortValue: (o) =>
        o.status === "DELIVERED" ||
        o.status === "FAILED_ATTEMPT" ||
        o.status === "RETURNED" ||
        o.status === "CANCELLED"
          ? "Completed"
          : "Ongoing",
      cell: (o) => {
        const isCompleted =
          o.status === "DELIVERED" ||
          o.status === "FAILED_ATTEMPT" ||
          o.status === "RETURNED" ||
          o.status === "CANCELLED"
        return (
          <Badge variant={isCompleted ? "default" : "secondary"}>
            {isCompleted ? "Completed" : "Ongoing"}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => {
        const isAssigned = o.deliveryRiderId === currentRider?.id
        const canStartDelivery = o.status === "IN_TRANSIT" && isAssigned
        const canRecordOutcome = o.status === "OUT_FOR_DELIVERY" && isAssigned
        return (
          <div className="flex justify-end gap-1">
            {canStartDelivery && (
              <Button size="sm" onClick={() => openStartDelivery(o)}>
                <Navigation className="size-4" />
                Start
              </Button>
            )}
            {canRecordOutcome && (
              <Button size="sm" onClick={() => openAttempt(o)}>
                <CheckCircle2 className="size-4" />
                Record
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.rider.delivery.title(
          currentUser?.name.split(" ")[0] ?? "Rider",
        )}
        description={pageContent.rider.delivery.description}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {dateFilterLabel && (
          <span className="text-muted-foreground text-sm">
            {dateFilterLabel}
          </span>
        )}
      </div>

      <DateRangePicker
        from={dateFrom}
        to={dateTo}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="rider-delivery"
            searchable
            columns={columns}
            data={myDeliveries}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading || isRefreshing}
            emptyMessage="No deliveries waiting. Parcels appear here once a Warehouse Admin dispatches them to you."
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onRefresh={refresh}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
          />
        </CardContent>
      </Card>

      <OutForDeliveryDialog
        order={startTarget}
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
      />

      <DeliveryAttemptDialog
        order={activeOrder}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <OrderDetailsDialog
        orderCode={viewOrderCode}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </div>
  )
}
