"use client"

import {
  AlertTriangle,
  MoreHorizontal,
  RotateCcw,
  Undo2,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  CellContent,
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
import { columnLabels } from "@/config/table-column-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge"
import {
  deliveryAddressColumn,
  deliveryRiderColumn,
  merchantColumn,
} from "@/features/orders/components/order-table-columns"
import { FailedDeliveryDialog } from "@/features/orders/dialogs/failed-delivery-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Order, OrderStatus } from "@/lib/types"

type FilterTab = "NEEDS_ACTION" | "RESOLVED"

const TAB_STATUSES: Record<FilterTab, OrderStatus[] | undefined> = {
  NEEDS_ACTION: ["FAILED_ATTEMPT"],
  RESOLVED: ["RETURNED"],
}

export function WarehouseExceptionsPageClient({
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
    warehouseFailedOrders,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    statuses: _statuses,
    setStatuses,
    sortId,
    sortDir,
    onSortChange,
    isLoading,
  } = useOrders({ initialData, initialTotal, includeAllOrders: true })
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const [tab, setTab] = useState<FilterTab>("NEEDS_ACTION")
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const merchant = (id: string) => merchants.find((m) => m.id === id)
  const merchantName = (id: string) => merchant(id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const needsActionCount = warehouseFailedOrders

  const needsAction = useMemo(
    () =>
      currentWarehouse
        ? orders.filter(
            (o) =>
              o.warehouseId === currentWarehouse.id &&
              o.status === "FAILED_ATTEMPT",
          )
        : [],
    [orders, currentWarehouse],
  )

  const resolved = useMemo(
    () =>
      currentWarehouse
        ? allOrders.filter(
            (o) =>
              o.warehouseId === currentWarehouse.id && o.status === "RETURNED",
          )
        : [],
    [allOrders, currentWarehouse],
  )

  function openResolve(order: Order) {
    setActiveOrder(order)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<Order>[] = [
    {
      id: "order",
      header: columnLabels.order.order,
      sortable: true,
      sortValue: (o) => o.id,
      cell: (o) => (
        <CellTwoRow
          primary={<span className="font-mono font-medium">{o.id}</span>}
          secondary={<OrderStatusBadge status={o.status} />}
        />
      ),
    },
    merchantColumn(merchantName),
    deliveryRiderColumn(riderName),
    deliveryAddressColumn(),
    {
      id: "attempts",
      header: columnLabels.exceptions.attempts,
      align: "center",
      sortable: true,
      sortValue: (o) => o.deliveryAttempts ?? 1,
      cell: (o) => (
        <CellContent className="tabular-nums">
          {o.deliveryAttempts ?? 1}
        </CellContent>
      ),
    },
    {
      id: "resolvedBy",
      header: columnLabels.order.resolvedBy,
      cell: (o) =>
        o.status === "RETURNED" ? (
          <CellContent className="text-muted-foreground">
            {o.failedResolvedBy ?? "Warehouse Admin"}
          </CellContent>
        ) : (
          <CellContent className="text-muted-foreground">—</CellContent>
        ),
    },
    {
      id: "returnReason",
      header: columnLabels.order.returnReason,
      cellClassName: "whitespace-normal align-top",
      cell: (o) =>
        o.status === "RETURNED" && o.returnReason ? (
          <CellContent className="text-muted-foreground max-w-40">
            {o.returnReason}
          </CellContent>
        ) : (
          <CellContent className="text-muted-foreground">—</CellContent>
        ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => {
        const canResolve =
          o.status === "FAILED_ATTEMPT" &&
          o.warehouseId === currentWarehouse?.id
        return (
          <div className="flex justify-end">
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
                {canResolve ? (
                  <DropdownMenuItem onClick={() => openResolve(o)}>
                    <RotateCcw className="size-4" />
                    Resolve
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.exceptions.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.exceptions.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <StatCardList
        items={[
          {
            label: statCardLabels.warehouse.exceptions.needsAction.label,
            value: needsActionCount,
            icon: AlertTriangle,
            tone: "bg-destructive/10 text-destructive",
          },
          {
            label: statCardLabels.warehouse.exceptions.returned.label,
            value: resolved.length,
            icon: Undo2,
            tone: "bg-muted text-muted-foreground",
          },
          {
            label: statCardLabels.warehouse.exceptions.totalExceptions.label,
            value: needsActionCount + resolved.length,
            icon: Wrench,
            tone: "bg-chart-4/15 text-chart-4",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="warehouse-exceptions"
            searchable
            searchColumns={[
              "order",
              "merchant",
              "deliveryRider",
              "deliveryCity",
            ]}
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="NEEDS_ACTION">Needs action</TabsTrigger>
                  <TabsTrigger value="RESOLVED">Returned</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={tab === "NEEDS_ACTION" ? needsAction : resolved}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading}
            emptyMessage={
              tab === "NEEDS_ACTION"
                ? "No failed deliveries. Parcels appear here when a delivery rider records a failed attempt."
                : "Nothing returned yet."
            }
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
          />
        </CardContent>
      </Card>

      <FailedDeliveryDialog
        order={activeOrder}
        merchantName={
          activeOrder
            ? (merchant(activeOrder.merchantId)?.businessName ?? "Merchant")
            : ""
        }
        riderName={activeOrder ? riderName(activeOrder.deliveryRiderId) : ""}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
