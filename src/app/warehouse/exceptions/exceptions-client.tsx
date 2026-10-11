"use client"

import { AlertTriangle, MoreHorizontal, RotateCcw } from "lucide-react"
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
import type { Order } from "@/lib/types"

/**
 * FAILED_ATTEMPT is the only status a warehouse admin can still act on, and it
 * is the only one this page lists.
 *
 * RETURNED used to sit here under a "Resolved" tab. It is terminal — the
 * `return` transition sets it and nothing leaves it — so filing it on a page
 * whose purpose is "parcels you can still resolve" was ownership by history
 * rather than by state. Its return-reason and resolved-by columns moved to the
 * Completed page's `Returned` tab; nothing was lost, only filed correctly.
 */
const EXCEPTION_STATUSES = ["FAILED_ATTEMPT"]

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
    isRefreshing,
    mutate: refresh,
  } = useOrders({ initialData, initialTotal })
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const merchant = (id: string) => merchants.find((m) => m.id === id)
  const merchantName = (id: string) => merchant(id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"

  // Forced, like the approval queue: a single-status page has nothing to
  // switch between, and leaving the filter open would let a stray `statuses`
  // value from a previous page leak in and render the wrong parcels.
  useEffect(() => {
    setStatuses(EXCEPTION_STATUSES)
    setPage(1)
  }, [setStatuses, setPage])

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

      {/* One card, because there is one thing to act on. The page's counts
          belong to the parcels that still need a decision. */}
      <StatCardList
        items={[
          {
            label: statCardLabels.warehouse.exceptions.needsAction.label,
            value: needsActionCount,
            icon: AlertTriangle,
            tone: "bg-destructive/10 text-destructive",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {/* No tab bar (decision #11): a single-status page with two tabs was
              a tab that did nothing. */}
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
            columns={columns}
            data={needsAction}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading || isRefreshing}
            emptyMessage="No failed deliveries. Parcels appear here when a delivery rider records a failed attempt."
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
            onRefresh={refresh}
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
