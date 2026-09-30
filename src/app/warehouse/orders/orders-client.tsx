"use client"

import {
  Ban,
  Boxes,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Truck,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/data-table"
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
  codFeeColumn,
  collectibleColumn,
  deliveryAddressColumn,
  deliveryFeeColumn,
  deliveryRiderWithPhoneColumn,
  merchantColumn,
  orderCodeColumn,
  pickupRiderWithPhoneColumn,
  recipientNameColumn,
  statusColumn,
} from "@/features/orders/components/order-table-columns"
import { CancelOrderDialog } from "@/features/orders/dialogs/cancel-order-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Order, OrderStatus } from "@/lib/types"

type FilterTab = "ALL" | "IN_PROGRESS" | "DELIVERED" | "EXCEPTIONS"

const EXCEPTION_STATUSES: OrderStatus[] = ["FAILED_ATTEMPT", "RETURNED"]
const IN_PROGRESS_STATUSES: OrderStatus[] = [
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
]

const TAB_STATUSES: Record<FilterTab, OrderStatus[] | undefined> = {
  ALL: undefined,
  IN_PROGRESS: ["PICKED_UP", "IN_WAREHOUSE", "IN_TRANSIT", "OUT_FOR_DELIVERY"],
  DELIVERED: ["DELIVERED"],
  EXCEPTIONS: ["FAILED_ATTEMPT", "RETURNED"],
}

export function WarehouseOrdersPageClient({
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
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    statuses: _statuses,
    setStatuses,
    isLoading,
    isRefreshing,
    bulkCancelOrders,
    mutate: refresh,
  } = useOrders({ initialData, initialTotal, includeAllOrders: true })
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const [tab, setTab] = useState<FilterTab>("ALL")
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  async function handleBulkCancel(ids: string[]) {
    setBulkBusy(true)
    const res = await bulkCancelOrders(ids)
    if (res.ok) {
      toast.success(
        `${ids.length} order${ids.length === 1 ? "" : "s"} cancelled.`,
      )
    } else {
      toast.error(res.error ?? "Could not cancel orders.")
    }
    setBulkBusy(false)
  }

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"
  const riderPhone = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.phone ?? "—") : "—"

  const inProgress = useMemo(
    () => allOrders.filter((o) => IN_PROGRESS_STATUSES.includes(o.status)),
    [allOrders],
  )
  const delivered = useMemo(
    () => allOrders.filter((o) => o.status === "DELIVERED"),
    [allOrders],
  )
  const exceptions = useMemo(
    () => allOrders.filter((o) => EXCEPTION_STATUSES.includes(o.status)),
    [allOrders],
  )
  const inWarehouse = useMemo(
    () => allOrders.filter((o) => o.status === "IN_WAREHOUSE"),
    [allOrders],
  )

  const columns: DataTableColumn<Order>[] = [
    orderCodeColumn(),
    merchantColumn(merchantName),
    recipientNameColumn(),
    pickupRiderWithPhoneColumn(riderName, riderPhone),
    deliveryAddressColumn(),
    collectibleColumn(),
    deliveryFeeColumn(),
    codFeeColumn(),
    statusColumn(),
    deliveryRiderWithPhoneColumn(riderName, riderPhone),
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => {
        const canCancel = [
          "PENDING",
          "APPROVED",
          "PICKED_UP",
          "IN_WAREHOUSE",
          "IN_TRANSIT",
        ].includes(o.status)
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
                {canCancel ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCancelTarget(o)
                      setCancelOpen(true)
                    }}
                  >
                    <Ban className="size-4" />
                    Cancel order
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
        title={pageContent.warehouse.orders.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.orders.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.warehouse.orders.heldInWarehouse.label,
            value: inWarehouse.length,
            icon: Boxes,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.warehouse.orders.inProgress.label,
            value: inProgress.length,
            icon: Clock,
            tone: "bg-primary/10 text-primary",
          },
          {
            label: statCardLabels.warehouse.orders.delivered.label,
            value: delivered.length,
            icon: CheckCircle2,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.warehouse.orders.exceptions.label,
            value: exceptions.length,
            icon: Truck,
            tone: "bg-chart-4/15 text-chart-4",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="warehouse-orders"
            searchable
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="IN_PROGRESS">In progress</TabsTrigger>
                  <TabsTrigger value="DELIVERED">Delivered</TabsTrigger>
                  <TabsTrigger value="EXCEPTIONS">Exceptions</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={orders}
            getRowKey={(o) => o.id}
            emptyMessage="No orders to show for this view."
            loading={isLoading || isRefreshing}
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            onRefresh={refresh}
            bulkLoading={bulkBusy}
            selectedKeys={selectedOrders}
            onSelectionChange={setSelectedOrders}
            bulkActions={[
              {
                label: "Cancel",
                variant: "destructive",
                icon: <X className="size-4" />,
                disabled: bulkBusy,
                onClick: async (rows: Order[], clear: () => void) => {
                  await handleBulkCancel(
                    rows
                      .filter((o) =>
                        [
                          "PENDING",
                          "APPROVED",
                          "PICKED_UP",
                          "IN_WAREHOUSE",
                          "IN_TRANSIT",
                        ].includes(o.status),
                      )
                      .map((o) => o.id),
                  )
                  clear()
                },
              },
            ]}
          />
        </CardContent>
      </Card>

      <CancelOrderDialog
        order={cancelTarget}
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open)
          if (!open) setCancelTarget(null)
        }}
      />
    </div>
  )
}
