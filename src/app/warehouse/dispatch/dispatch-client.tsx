"use client"

import {
  Bike,
  MoreHorizontal,
  PackageOpen,
  Send,
  ShoppingBag,
  Truck,
  UserPlus,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  collectibleColumn,
  deliveryAddressColumn,
  deliveryRiderWithPhoneColumn,
  deliveryTypeColumn,
  merchantColumn,
  orderCodeColumn,
  recipientNameColumn,
  statusColumn,
} from "@/features/orders/components/order-table-columns"
import { AssignPickupRiderDialog } from "@/features/orders/dialogs/assign-pickup-rider-dialog"
import { BulkAssignPickupRiderDialog } from "@/features/orders/dialogs/bulk-assign-pickup-rider-dialog"
import { BulkDispatchDialog } from "@/features/orders/dialogs/bulk-dispatch-dialog"
import { OrderDetailsDialog } from "@/features/orders/dialogs/order-details-dialog"
import { WarehouseDispatchDialog } from "@/features/orders/dialogs/warehouse-dispatch-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Order, OrderStatus } from "@/lib/types"

type FilterTab = "PICKUP" | "IN_PICKUP" | "DELIVERY" | "DISPATCHED"

const TAB_STATUSES: Record<FilterTab, OrderStatus[] | undefined> = {
  PICKUP: ["APPROVED"],
  IN_PICKUP: ["APPROVED", "PICKED_UP"],
  DELIVERY: ["IN_WAREHOUSE"],
  DISPATCHED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
}

export function WarehouseDispatchPageClient({
  initialData,
  initialTotal,
}: {
  initialData: Order[]
  initialTotal: number
}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const {
    orders,
    allOrders,
    total,
    setPage,
    setLimit,
    query,
    setQuery,
    setStatuses,
    isLoading,
  } = useOrders({ initialData, initialTotal, includeAllOrders: true })
  const { merchants } = useMerchants()
  const { riders, warehouseDeliveryRiders } = useRiders()
  const [tab, setTab] = useState<FilterTab>("PICKUP")
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkPickupOpen, setBulkPickupOpen] = useState(false)
  const [bulkDispatchOpen, setBulkDispatchOpen] = useState(false)
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<Order | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  const merchant = useCallback(
    (id: string) => merchants.find((m) => m.id === id),
    [merchants],
  )
  const merchantName = useCallback(
    (id: string) => merchant(id)?.businessName ?? "Merchant",
    [merchant],
  )
  const riderName = useCallback(
    (id?: string | null) =>
      id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—",
    [riders],
  )
  const riderPhone = useCallback(
    (id?: string | null) =>
      id ? (riders.find((r) => r.id === id)?.phone ?? "—") : "—",
    [riders],
  )

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const pickup = useMemo(
    () =>
      currentWarehouse
        ? allOrders.filter((o) => o.status === "APPROVED" && !o.pickupRiderId)
        : [],
    [allOrders, currentWarehouse],
  )

  const inPickup = useMemo(
    () =>
      currentWarehouse
        ? allOrders.filter(
            (o) =>
              ["APPROVED", "PICKED_UP"].includes(o.status) &&
              o.pickupRiderId != null,
          )
        : [],
    [allOrders, currentWarehouse],
  )

  const ready = useMemo(
    () =>
      currentWarehouse
        ? allOrders.filter(
            (o) =>
              o.status === "IN_WAREHOUSE" &&
              o.warehouseId === currentWarehouse.id,
          )
        : [],
    [allOrders, currentWarehouse],
  )

  const dispatched = useMemo(
    () =>
      currentWarehouse
        ? allOrders.filter(
            (o) =>
              o.warehouseId === currentWarehouse.id &&
              o.deliveryRiderId != null &&
              ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
                o.status,
              ),
          )
        : [],
    [allOrders, currentWarehouse],
  )

  const data = useMemo(() => {
    if (tab === "PICKUP")
      return orders.filter((o) => o.status === "APPROVED" && !o.pickupRiderId)
    if (tab === "IN_PICKUP")
      return orders.filter((o) => o.pickupRiderId != null)
    if (tab === "DELIVERY")
      return orders.filter((o) => o.status === "IN_WAREHOUSE")
    if (tab === "DISPATCHED")
      return orders.filter((o) => o.deliveryRiderId != null)
    return orders
  }, [orders, tab])

  const unassignedDeliveryRiderColumn = useMemo<DataTableColumn<Order>>(
    () => ({
      ...deliveryRiderWithPhoneColumn(riderName, riderPhone),
      cell: (o) =>
        o.deliveryRiderId ? (
          <CellTwoRow
            primary={riderName(o.deliveryRiderId)}
            secondary={riderPhone(o.deliveryRiderId)}
          />
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    }),
    [riderName, riderPhone],
  )

  const columns = useMemo<DataTableColumn<Order>[]>(() => {
    const actions: DataTableColumn<Order> = {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => {
        const canAssignPickup =
          tab === "PICKUP" && o.status === "APPROVED" && !o.pickupRiderId
        const canAssignDelivery =
          tab === "DELIVERY" && o.status === "IN_WAREHOUSE"
        return (
          <div className="flex justify-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {canAssignPickup && (
                  <DropdownMenuItem
                    onClick={() => {
                      setAssignTarget(o)
                      setAssignOpen(true)
                    }}
                  >
                    <Bike className="size-4" />
                    Assign rider
                  </DropdownMenuItem>
                )}
                {canAssignDelivery && (
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveOrder(o)
                      setDialogOpen(true)
                    }}
                  >
                    <Send className="size-4" />
                    Assign rider
                  </DropdownMenuItem>
                )}
                {!canAssignPickup && !canAssignDelivery && (
                  <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    }

    return [
      orderCodeColumn({
        onOrderClick: (o) => {
          setViewOrderCode(o.id)
          setViewOpen(true)
        },
      }),
      merchantColumn(merchantName),
      recipientNameColumn(),
      deliveryAddressColumn(),
      unassignedDeliveryRiderColumn,
      deliveryTypeColumn(),
      collectibleColumn(),
      statusColumn(),
      actions,
    ]
  }, [tab, merchantName, unassignedDeliveryRiderColumn])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.dispatch.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.dispatch.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.warehouse.dispatch.readyForPickup.label,
            value: pickup.length,
            icon: ShoppingBag,
            tone: "bg-chart-3/15 text-chart-3",
          },
          {
            label: statCardLabels.warehouse.dispatch.inPickup.label,
            value: inPickup.length,
            icon: Bike,
            tone: "bg-chart-4/15 text-chart-4",
          },
          {
            label: statCardLabels.warehouse.dispatch.readyToDispatch.label,
            value: ready.length,
            icon: PackageOpen,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.warehouse.dispatch.dispatched.label,
            value: dispatched.length,
            icon: Truck,
            tone: "bg-chart-2/15 text-chart-2",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id={`warehouse-dispatch-${tab.toLowerCase()}`}
            searchable
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="PICKUP">Pickup</TabsTrigger>
                  <TabsTrigger value="IN_PICKUP">In pickup</TabsTrigger>
                  <TabsTrigger value="DELIVERY">Delivery</TabsTrigger>
                  <TabsTrigger value="DISPATCHED">Dispatched</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={data}
            getRowKey={(o) => o.id}
            loading={isLoading}
            emptyMessage={
              tab === "PICKUP"
                ? "No approved orders ready for pickup."
                : tab === "IN_PICKUP"
                  ? "No orders currently in pickup."
                  : tab === "DELIVERY"
                    ? "Nothing ready to dispatch. Parcels appear here once they're received into the warehouse."
                    : "Nothing dispatched yet."
            }
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            selectedKeys={selectedOrders}
            onSelectionChange={setSelectedOrders}
            bulkActions={
              tab === "PICKUP"
                ? [
                    {
                      label: "Assign pickup rider",
                      icon: <UserPlus className="size-4" />,
                      onClick: async (_rows: Order[], _clear: () => void) => {
                        setBulkPickupOpen(true)
                      },
                    },
                  ]
                : tab === "DELIVERY"
                  ? [
                      {
                        label: "Assign delivery rider",
                        icon: <Send className="size-4" />,
                        onClick: async (_rows: Order[], _clear: () => void) => {
                          setBulkDispatchOpen(true)
                        },
                      },
                    ]
                  : undefined
            }
          />
        </CardContent>
      </Card>

      <AssignPickupRiderDialog
        order={assignTarget}
        warehouseName={currentWarehouse?.name ?? "your warehouse"}
        open={assignOpen}
        onOpenChange={(open) => {
          setAssignOpen(open)
          if (!open) setAssignTarget(null)
        }}
      />

      <WarehouseDispatchDialog
        order={activeOrder}
        merchantName={
          activeOrder
            ? (merchant(activeOrder.merchantId)?.businessName ?? "Merchant")
            : ""
        }
        warehouseName={currentWarehouse?.name ?? "your warehouse"}
        deliveryRiders={warehouseDeliveryRiders}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <BulkAssignPickupRiderDialog
        count={selectedOrders.size}
        ids={Array.from(selectedOrders)}
        open={bulkPickupOpen}
        onOpenChange={(v) => {
          if (!v) setSelectedOrders(new Set())
          setBulkPickupOpen(v)
        }}
        onComplete={() => setSelectedOrders(new Set())}
      />

      <BulkDispatchDialog
        count={selectedOrders.size}
        ids={Array.from(selectedOrders)}
        deliveryRiders={warehouseDeliveryRiders}
        warehouseName={currentWarehouse?.name ?? "your warehouse"}
        open={bulkDispatchOpen}
        onOpenChange={(v) => {
          if (!v) setSelectedOrders(new Set())
          setBulkDispatchOpen(v)
        }}
        onComplete={() => setSelectedOrders(new Set())}
      />

      <OrderDetailsDialog
        orderCode={viewOrderCode}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </div>
  )
}
