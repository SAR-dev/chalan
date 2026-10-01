"use client"

import {
  Ban,
  Check,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Package,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { QuickFilters } from "@/components/quick-filters"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useOrderColumns } from "@/features/orders/components/order-table-columns"
import { ApproveOrderDialog } from "@/features/orders/dialogs/approve-order-dialog"
import { CancelOrderDialog } from "@/features/orders/dialogs/cancel-order-dialog"
import { OrderDetailsDrawer } from "@/features/orders/dialogs/order-details-drawer"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { businessPresetRange } from "@/lib/timezone"
import type { Order } from "@/lib/types"

type FilterTab = "PENDING" | "APPROVED" | "ALL"

const TAB_STATUSES: Record<FilterTab, string[] | undefined> = {
  PENDING: ["PENDING"],
  APPROVED: ["APPROVED"],
  ALL: undefined,
}

export function OrdersPageClient({
  initialData,
  initialTotal,
  initialCounts,
}: {
  initialData: Order[]
  initialTotal: number
  initialCounts: {
    pending: number
    approved: number
    inProgress: number
    total: number
  }
}) {
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
    bulkApproveOrders,
    bulkCancelOrders,
    dateFrom: _dateFrom,
    setDateFrom,
    dateTo: _dateTo,
    setDateTo,
    sortId,
    sortDir,
    onSortChange,
    mutate: refresh,
  } = useOrders({ initialData, initialTotal })
  const baseColumns = useOrderColumns()
  const [tab, setTab] = useState<FilterTab>("PENDING")
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const counts = useMemo(
    () => ({
      pending:
        allOrders.filter((o) => o.status === "PENDING").length ||
        initialCounts.pending,
      approved:
        allOrders.filter((o) => o.status === "APPROVED").length ||
        initialCounts.approved,
      inProgress:
        allOrders.filter(
          (o) =>
            !["PENDING", "DELIVERED", "RETURNED", "CANCELLED"].includes(
              o.status,
            ),
        ).length || initialCounts.inProgress,
      total: allOrders.length || initialCounts.total,
    }),
    [allOrders, initialCounts],
  )

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  type DatePreset = "today" | "yesterday" | "last7"
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null)

  // Business-local calendar days, not instants (ROADMAP R0.3) — see
  // `businessPresetRange` for why the string form matters.
  function setDateRange(preset: DatePreset) {
    const { from, to } = businessPresetRange(preset)
    setDateFrom(from)
    setDateTo(to)
  }

  function clearDateRange() {
    setDateFrom(undefined)
    setDateTo(undefined)
    setDatePreset(null)
  }

  const quickFilterSections = [
    {
      label: "Created Date",
      filters: [
        {
          label: "Today",
          value: "today",
          active: datePreset === "today",
          onToggle: () => {
            if (datePreset === "today") {
              clearDateRange()
            } else {
              setDatePreset("today")
              setDateRange("today")
            }
          },
        },
        {
          label: "Yesterday",
          value: "yesterday",
          active: datePreset === "yesterday",
          onToggle: () => {
            if (datePreset === "yesterday") {
              clearDateRange()
            } else {
              setDatePreset("yesterday")
              setDateRange("yesterday")
            }
          },
        },
        {
          label: "Last 7 days",
          value: "last7",
          active: datePreset === "last7",
          onToggle: () => {
            if (datePreset === "last7") {
              clearDateRange()
            } else {
              setDatePreset("last7")
              setDateRange("last7")
            }
          },
        },
      ],
    },
  ]

  async function handleBulkApprove(ids: string[]) {
    setBulkBusy(true)
    const res = await bulkApproveOrders(ids)
    if (res.ok) {
      toast.success(
        `${ids.length} order${ids.length === 1 ? "" : "s"} approved.`,
      )
    } else {
      toast.error(res.error ?? "Could not approve orders.")
    }
    setBulkBusy(false)
  }

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

  function openApprove(order: Order) {
    setActiveOrder(order)
    setDialogOpen(true)
  }

  const removedIds = new Set([
    "warehouseCity",
    "pickupLabel",
    "pickupRider",
    "deliveryRider",
    "deliveryFee",
    "codFee",
  ])

  const sortableIds = new Set(["order", "parcelWeight", "collectible"])

  const columns: DataTableColumn<Order>[] = [
    ...baseColumns
      .filter((c) => !removedIds.has(c.id))
      .map((c) => ({
        ...c,
        ...(sortableIds.has(c.id)
          ? {}
          : {
              sortable: false as const,
              sortValue: undefined as undefined,
            }),
        ...(c.id === "order"
          ? {
              cell: (o: Order) => (
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
            }
          : {}),
      })),
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => {
        const canApprove = o.status === "PENDING"
        const canCancel = [
          "PENDING",
          "APPROVED",
          "PICKED_UP",
          "IN_WAREHOUSE",
          "IN_TRANSIT",
        ].includes(o.status)
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    // Scoped by order: this column is one menu per row, so an
                    // unqualified "Actions" would be ambiguous on any list with
                    // more than one pending order — which is most of them.
                    data-testid={`order-actions-${o.id}`}
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {canApprove && (
                  <DropdownMenuItem
                    onClick={() => openApprove(o)}
                    data-testid={`order-review-${o.id}`}
                  >
                    <ShieldCheck className="size-4" />
                    Review order
                  </DropdownMenuItem>
                )}
                {canApprove && canCancel && <DropdownMenuSeparator />}
                {canCancel && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setCancelTarget(o)
                      setCancelOpen(true)
                    }}
                  >
                    <Ban className="size-4" />
                    Cancel order
                  </DropdownMenuItem>
                )}
                {!canApprove && !canCancel && (
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
        title={pageContent.dashboard.orders.title}
        description={pageContent.dashboard.orders.description}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.dashboard.orders.pendingApproval.label,
            value: counts.pending,
            icon: Clock,
            tone: "bg-chart-3/15 text-chart-3",
          },
          {
            label: statCardLabels.dashboard.orders.approved.label,
            value: counts.approved,
            icon: CheckCircle2,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.dashboard.orders.inProgress.label,
            value: counts.inProgress,
            icon: Truck,
            tone: "bg-chart-4/15 text-chart-4",
          },
          {
            label: statCardLabels.dashboard.orders.totalOrders.label,
            value: counts.total,
            icon: Package,
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="dashboard-orders"
            searchable
            searchColumns={["order", "merchant", "warehouse"]}
            toolbarLeft={
              <div className="flex items-center gap-3">
                <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="PENDING">Pending</TabsTrigger>
                    <TabsTrigger value="APPROVED">Approved</TabsTrigger>
                    <TabsTrigger value="ALL">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <QuickFilters
                  sections={quickFilterSections}
                  activeCount={datePreset ? 1 : 0}
                  onClearAll={clearDateRange}
                />
              </div>
            }
            columns={columns}
            data={orders}
            getRowKey={(o) => o.id}
            emptyMessage="No orders match the current filters."
            loading={isLoading || isRefreshing}
            serverPaginated
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
            onRefresh={refresh}
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            csvData={orders}
            bulkLoading={bulkBusy}
            selectedKeys={selectedOrders}
            onSelectionChange={setSelectedOrders}
            bulkActions={[
              {
                label: "Approve",
                icon: <Check className="size-4" />,
                disabled: bulkBusy,
                onClick: async (rows, clear) => {
                  await handleBulkApprove(
                    rows.filter((o) => o.status === "PENDING").map((o) => o.id),
                  )
                  clear()
                },
              },
              {
                label: "Cancel",
                variant: "destructive",
                icon: <X className="size-4" />,
                disabled: bulkBusy,
                onClick: async (rows, clear) => {
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
            csv={{
              filename: "orders",
              headers: [
                "Tracking",
                "Status",
                "Recipient",
                "Phone",
                "City",
                "Weight (KG)",
                "Delivery type",
                "COD amount",
                "Delivery charge",
              ],
              parser: (o) => [
                o.id,
                o.status,
                o.recipientName,
                o.recipientPhone,
                o.deliveryCity,
                o.parcelWeightKg,
                o.deliveryType,
                o.productCost,
                o.deliveryFee,
              ],
            }}
          />
        </CardContent>
      </Card>

      <ApproveOrderDialog
        order={activeOrder}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <CancelOrderDialog
        order={cancelTarget}
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open)
          if (!open) setCancelTarget(null)
        }}
      />

      <OrderDetailsDrawer
        orderCode={viewOrderCode}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </div>
  )
}
