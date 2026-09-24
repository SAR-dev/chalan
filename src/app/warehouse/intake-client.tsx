"use client"

import { Boxes, Clock, PackageOpen, PackagePlus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  collectibleColumn,
  deliveryAddressColumn,
  merchantColumn,
  orderCodeColumn,
  pickupAddressColumn,
  pickupRiderWithPhoneColumn,
  recipientNameColumn,
  statusColumn,
} from "@/features/orders/components/order-table-columns"
import { WarehouseReceiveDialog } from "@/features/orders/dialogs/warehouse-receive-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Order, OrderStatus } from "@/lib/types"

type FilterTab = "INCOMING" | "RECEIVED"

const TAB_STATUSES: Record<FilterTab, OrderStatus[] | undefined> = {
  INCOMING: ["PICKED_UP"],
  RECEIVED: ["IN_WAREHOUSE", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
}

export function IntakePageClient({
  initialData,
  initialTotal,
}: {
  initialData: Order[]
  initialTotal: number
}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const {
    allOrders,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    statuses: _statuses,
    setStatuses,
    isLoading,
    bulkReceiveOrders,
  } = useOrders({ initialData, initialTotal, includeAllOrders: true })
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const { pickupLocations } = usePickupLocations()
  const [tab, setTab] = useState<FilterTab>("INCOMING")
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function handleBulkReceive(ids: string[]) {
    setBulkBusy(true)
    const res = await bulkReceiveOrders(ids)
    if (res.ok) {
      toast.success(
        `${ids.length} parcel${ids.length === 1 ? "" : "s"} received.`,
      )
    } else {
      toast.error(res.error ?? "Could not receive parcels.")
    }
    setBulkBusy(false)
  }

  const merchant = (id: string) => merchants.find((m) => m.id === id)
  const merchantName = (id: string) => merchant(id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"
  const riderPhone = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.phone ?? "—") : "—"
  const pickupLocation = (id: string) =>
    pickupLocations.find((p) => p.id === id) ?? null

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  function _getOrderSearchValue(o: Order, columnId: string): string | null {
    switch (columnId) {
      case "order":
        return o.id
      case "merchant":
        return merchantName(o.merchantId)
      case "receiver":
        return `${o.recipientName} ${o.recipientPhone}`
      case "pickupAddress":
        return pickupLocation(o.pickupLocationId)?.address ?? null
      case "pickupRider":
        return riderName(o.pickupRiderId)
      case "deliveryAddressOnly":
        return [o.deliveryCity, o.deliveryAddress].filter(Boolean).join(", ")
      case "collectible":
        return String(o.productCost)
      case "status":
        return o.status
      default:
        return null
    }
  }

  const incoming = useMemo(
    () => allOrders.filter((o) => o.status === "PICKED_UP"),
    [allOrders],
  )

  const received = useMemo(
    () =>
      currentWarehouse
        ? allOrders.filter(
            (o) =>
              o.warehouseId === currentWarehouse.id &&
              [
                "IN_WAREHOUSE",
                "IN_TRANSIT",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
              ].includes(o.status),
          )
        : [],
    [allOrders, currentWarehouse],
  )

  function openConfirm(order: Order) {
    setActiveOrder(order)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<Order>[] = [
    orderCodeColumn(),
    merchantColumn(merchantName),
    recipientNameColumn(),
    pickupAddressColumn(pickupLocation),
    pickupRiderWithPhoneColumn(riderName, riderPhone),
    deliveryAddressColumn(),
    collectibleColumn(),
    statusColumn(),
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => (
        <div className="flex justify-end gap-1">
          {o.status === "PICKED_UP" ? (
            <Button size="sm" onClick={() => openConfirm(o)}>
              <PackagePlus className="size-4" />
              Receive
            </Button>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.intake.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.intake.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <StatCardList
        items={[
          {
            label: statCardLabels.warehouse.intake.incoming.label,
            value: incoming.length,
            icon: Clock,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.warehouse.intake.received.label,
            value: received.length,
            icon: Boxes,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.warehouse.intake.heldInWarehouse.label,
            value: received.filter((o) => o.status === "IN_WAREHOUSE").length,
            icon: PackageOpen,
            tone: "bg-primary/10 text-primary",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="warehouse-intake"
            searchable
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="INCOMING">Incoming</TabsTrigger>
                  <TabsTrigger value="RECEIVED">Received</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            searchColumns={["order", "merchant", "receiver"]}
            columns={columns}
            data={tab === "INCOMING" ? incoming : received}
            getRowKey={(o) => o.id}
            loading={isLoading}
            emptyMessage={
              tab === "INCOMING"
                ? "No parcels incoming. Parcels appear here once a rider marks them picked up."
                : "Nothing received yet."
            }
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            bulkLoading={bulkBusy}
            selectedKeys={selectedOrders}
            onSelectionChange={setSelectedOrders}
            bulkActions={
              tab === "INCOMING"
                ? [
                    {
                      label: "Receive",
                      icon: <PackagePlus className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (rows: Order[], clear: () => void) => {
                        await handleBulkReceive(
                          rows
                            .filter((o) => o.status === "PICKED_UP")
                            .map((o) => o.id),
                        )
                        clear()
                      },
                    },
                  ]
                : undefined
            }
          />
        </CardContent>
      </Card>

      <WarehouseReceiveDialog
        order={activeOrder}
        merchantName={
          activeOrder
            ? (merchant(activeOrder.merchantId)?.businessName ?? "Merchant")
            : ""
        }
        riderName={activeOrder ? riderName(activeOrder.pickupRiderId) : ""}
        warehouseName={currentWarehouse?.name ?? "your warehouse"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
