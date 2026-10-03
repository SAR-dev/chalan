"use client"

import {
  AlertCircle,
  Ban,
  ExternalLink,
  Package,
  PackagePlus,
  Wallet,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useMemo, useState } from "react"

// recharts is heavy and is only needed once the analytics payload has arrived,
// so the chart components (and recharts with them) are loaded on demand rather
// than shipped in the merchant dashboard's initial bundle. Importing the files
// directly also avoids the barrel pulling in the unused BarChart.
const AreaChart = dynamic(
  () => import("@/components/charts/area-chart").then((m) => m.AreaChart),
  { ssr: false },
)
const PieChart = dynamic(
  () => import("@/components/charts/pie-chart").then((m) => m.PieChart),
  { ssr: false },
)

import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { MerchantStatusBadge } from "@/features/merchants/components/merchant-status-badge"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge"
import { CancelOrderDialog } from "@/features/orders/dialogs/cancel-order-dialog"
import { OrderDetailsDrawer } from "@/features/orders/dialogs/order-details-drawer"
import { useOrderAnalytics } from "@/features/orders/hooks/use-order-analytics"
import { useOrderSummary } from "@/features/orders/hooks/use-order-summary"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

type FilterTab = "IN_PROGRESS" | "DELIVERED" | "PAYOUT_READY"

const IN_PROGRESS_STATUSES = [
  "PENDING",
  "APPROVED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
]

export default function MerchantOverviewPage() {
  const { currentUser } = useAuth()
  const { currentMerchant } = useMerchants()
  const { orders, isLoading, isRefreshing, mutate: refreshOrders } = useOrders()
  const { analytics, isLoading: analyticsLoading } = useOrderAnalytics()
  // Headline figures are aggregated server-side over the whole account
  //. `orders` above is a single page of rows, so deriving money
  // totals from it showed a merchant with 400 delivered orders the earnings of
  // their newest 20 — with nothing on screen to reveal the truncation.
  const { summary, refresh: refreshSummary } = useOrderSummary()

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [tab, setTab] = useState<FilterTab>("IN_PROGRESS")

  const myOrders = useMemo(
    () =>
      currentMerchant
        ? orders.filter((o) => o.merchantId === currentMerchant.id)
        : [],
    [orders, currentMerchant],
  )

  // Row sets for the table below only — these narrow what is *displayed*,
  // which is the one thing a single page of orders is authoritative for.
  const inProgress = myOrders.filter((o) =>
    IN_PROGRESS_STATUSES.includes(o.status),
  )
  const delivered = myOrders.filter((o) => o.status === "DELIVERED")
  const payoutReady = myOrders.filter(
    (o) => o.status === "DELIVERED" && o.codSettledAt && !o.payoutRequestId,
  )

  const isActive = currentMerchant?.status === "ACTIVE"

  const filteredOrders =
    tab === "IN_PROGRESS"
      ? inProgress
      : tab === "DELIVERED"
        ? delivered
        : payoutReady

  const orderColumns: DataTableColumn<Order>[] = [
    {
      id: "order",
      header: columnLabels.order.order,
      sortable: true,
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
      id: "recipient",
      header: columnLabels.order.recipient,
      sortable: true,
      sortValue: (o) => o.recipientName,
      cell: (o) => <span className="font-medium">{o.recipientName}</span>,
    },
    {
      id: "status",
      header: columnLabels.order.status,
      sortable: true,
      sortValue: (o) => o.status,
      cell: (o) => <OrderStatusBadge status={o.status} />,
    },
    {
      id: "collectible",
      header: columnLabels.order.collectible,
      align: "right",
      sortable: true,
      sortValue: (o) => o.productCost,
      cell: (o) => (
        <span className="font-medium tabular-nums">
          {formatTk(o.productCost)}
        </span>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-16",
      cell: (o) => {
        const canCancel = o.status === "PENDING" || o.status === "APPROVED"
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              render={
                <a
                  href={`/track/${o.trackingToken ?? o.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              nativeButton={false}
            >
              <ExternalLink className="size-3.5" />
              Track
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canCancel}
              onClick={() => {
                setCancelTarget(o)
                setCancelOpen(true)
              }}
            >
              <Ban className="size-3.5" />
              Cancel
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title={pageContent.merchant.overview.title(
          currentUser?.name.split(" ")[0] ?? "Merchant",
        )}
        description={pageContent.merchant.overview.description}
      >
        {isActive ? (
          <Button
            render={<Link href="/merchant/orders/new" />}
            nativeButton={false}
          >
            <PackagePlus className="size-4" />
            Create order
          </Button>
        ) : null}
      </PageHeader>

      {currentMerchant && !isActive ? (
        <Card className="border-chart-3/30 bg-chart-3/5 mb-6">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertCircle className="text-chart-3 mt-0.5 size-5 shrink-0" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Account not active yet</p>
                <MerchantStatusBadge status={currentMerchant.status} />
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {currentMerchant.status === "PENDING"
                  ? "Your business is awaiting Super Admin approval. Once approved and priced by an Admin, you can start creating orders."
                  : "Your account is currently suspended. Please contact the platform team to restore access."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <StatCardList
        columns={4}
        items={[
          {
            label: "COD to collect",
            value: formatTk(summary?.codToCollect ?? 0),
            hint: `${summary?.inProgressCount ?? 0} orders in transit`,
            icon: Wallet,
          },
          {
            label: "COD to settle",
            value: summary?.codToSettleCount ?? 0,
            hint: formatTk(summary?.codToSettleAmount ?? 0),
            icon: Package,
          },
          {
            label: "Payout to issue",
            value: formatTk(summary?.payoutToIssue ?? 0),
            hint: `${summary?.payoutReadyCount ?? 0} orders ready`,
            icon: Wallet,
          },
          {
            label: "Total earnings",
            value: formatTk(summary?.totalEarnings ?? 0),
            hint: `${summary?.deliveredCount ?? 0} delivered`,
            icon: Wallet,
          },
        ]}
      />

      {/* Analytics Charts */}
      {analytics && analytics.ordersByDay.length > 0 && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Orders over time</CardTitle>
              <CardDescription>Daily order volume</CardDescription>
            </CardHeader>
            <CardContent>
              <AreaChart
                data={analytics.ordersByDay.map((d) => ({
                  label: d.date,
                  value: d.count,
                }))}
                height={200}
                loading={analyticsLoading}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Order status</CardTitle>
              <CardDescription>Current distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <PieChart
                data={analytics.ordersByStatus.map((d) => ({
                  name: d.status,
                  value: d.count,
                }))}
                height={200}
                loading={analyticsLoading}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              {tab === "IN_PROGRESS" && "Orders currently being processed."}
              {tab === "DELIVERED" && "Successfully delivered orders."}
              {tab === "PAYOUT_READY" &&
                "Delivered orders ready for payout request."}
            </CardDescription>
          </div>
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/merchant/orders" />}
              nativeButton={false}
            >
              View all
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 sm:px-5 mb-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList>
                <TabsTrigger value="IN_PROGRESS">
                  In progress ({summary?.inProgressCount ?? 0})
                </TabsTrigger>
                <TabsTrigger value="DELIVERED">
                  Delivered ({summary?.deliveredCount ?? 0})
                </TabsTrigger>
                <TabsTrigger value="PAYOUT_READY">
                  Payout ready ({summary?.payoutReadyCount ?? 0})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <DataTable
            pinnedColumns={["order"]}
            id="merchant-overview"
            searchable={false}
            columns={orderColumns}
            data={filteredOrders}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading || isRefreshing}
            onRefresh={() => {
              void refreshOrders()
              void refreshSummary()
            }}
            emptyMessage={
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                  <Package className="size-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">No orders</p>
                  <p className="text-muted-foreground text-sm">
                    {tab === "IN_PROGRESS" &&
                      "No orders currently in progress."}
                    {tab === "PAYOUT_READY" && "No orders ready for payout."}
                    {tab === "DELIVERED" && "No delivered orders yet."}
                  </p>
                </div>
              </div>
            }
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

      <OrderDetailsDrawer
        orderCode={viewOrderCode}
        open={viewOpen}
        onOpenChange={setViewOpen}
        detailsHref={
          viewOrderCode ? `/merchant/orders/${viewOrderCode}` : undefined
        }
      />
    </>
  )
}
