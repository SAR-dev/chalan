"use client"

import { MapPin, PackageCheck } from "lucide-react"
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
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderDetailsDialog } from "@/features/orders/dialogs/order-details-dialog"
import { PickupConfirmDialog } from "@/features/orders/dialogs/pickup-confirm-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useRiders } from "@/features/riders/hooks/use-riders"
import type { Order } from "@/lib/types"

export default function RiderPickupQueuePage() {
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
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  } = useOrders()
  const { merchants } = useMerchants()
  const { pickupLocations } = usePickupLocations()
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [setPage])

  const merchantFn = (id: string) => merchants.find((m) => m.id === id)
  const merchantNameFn = (id: string) =>
    merchantFn(id)?.businessName ?? "Merchant"
  const pickup = (id: string) => pickupLocations.find((p) => p.id === id)

  const myPickups = useMemo(
    () =>
      currentRider
        ? orders.filter((o) => o.pickupRiderId === currentRider.id)
        : [],
    [orders, currentRider],
  )

  const dateFilterLabel =
    dateFrom || dateTo
      ? `Filtered: ${dateFrom ?? "start"} to ${dateTo ?? "now"}`
      : null

  function openConfirm(order: Order) {
    setActiveOrder(order)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<Order>[] = [
    {
      id: "order",
      header: columnLabels.rider.orderId,
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
      id: "merchant",
      header: columnLabels.rider.merchant,
      cell: (o) => (
        <span className="font-medium">{merchantNameFn(o.merchantId)}</span>
      ),
    },
    {
      id: "merchantPhone",
      header: columnLabels.rider.contact,
      cell: (o) => {
        const phone = o.merchantPhone ?? null
        return phone ? (
          <a href={`tel:${phone}`} className="text-sm hover:underline">
            {phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      id: "pickupAddress",
      header: columnLabels.rider.pickupFrom,
      cell: (o) => {
        const p = pickup(o.pickupLocationId)
        return (
          <span className="text-muted-foreground text-xs">
            {p?.address ?? "—"}
          </span>
        )
      },
    },
    {
      id: "mapLink",
      header: columnLabels.rider.mapLink,
      align: "center",
      cell: (o) => {
        const mapLink = o.pickupLocationMapLink ?? null
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
      id: "status",
      header: columnLabels.order.status,
      cell: (o) => {
        const isCompleted = o.status !== "APPROVED"
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
        const canPickup =
          o.status === "APPROVED" && o.pickupRiderId === currentRider?.id
        return (
          <div className="flex justify-end gap-1">
            {canPickup ? (
              <Button size="sm" onClick={() => openConfirm(o)}>
                <PackageCheck className="size-4" />
                Picked up
              </Button>
            ) : null}
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.rider.pickup.title(
          currentUser?.name.split(" ")[0] ?? "Rider",
        )}
        description={pageContent.rider.pickup.description}
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
            id="rider-pickup"
            searchable
            columns={columns}
            data={myPickups}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading}
            emptyMessage="No pickups waiting. New pickups appear here once an Admin assigns them to you."
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
          />
        </CardContent>
      </Card>

      <PickupConfirmDialog
        order={activeOrder}
        merchantName={
          activeOrder
            ? (merchantFn(activeOrder.merchantId)?.businessName ?? "Merchant")
            : ""
        }
        pickupLocation={
          activeOrder ? (pickup(activeOrder.pickupLocationId) ?? null) : null
        }
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
