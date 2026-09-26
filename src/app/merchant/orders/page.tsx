"use client"

import { Ban, ExternalLink, Package, Upload } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  CellContent,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { CancelOrderDialog } from "@/features/orders/dialogs/cancel-order-dialog"
import { OrderDetailsDrawer } from "@/features/orders/dialogs/order-details-drawer"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { formatTk } from "@/lib/pricing"
import type { Order, OrderStatus } from "@/lib/types"

type FilterTab = "ACTIVE" | "PENDING" | "IN_PROGRESS" | "ISSUES" | "ALL"

const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "FAILED_ATTEMPT",
  "RETURNED",
]

const TAB_STATUSES: Record<FilterTab, string[] | undefined> = {
  ACTIVE: ACTIVE_STATUSES,
  PENDING: ["PENDING"],
  IN_PROGRESS: [
    "APPROVED",
    "PICKED_UP",
    "IN_WAREHOUSE",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
  ],
  ISSUES: ["FAILED_ATTEMPT", "RETURNED"],
  ALL: undefined,
}

export default function MerchantOrdersPage() {
  const {
    orders,
    total,
    setPage,
    setLimit,
    query,
    setQuery,
    statuses: _statuses,
    setStatuses,
    isLoading,
    sortId,
    sortDir,
    onSortChange,
    mutate: refresh,
  } = useOrders()

  const { pickupLocations } = usePickupLocations()
  const [tab, setTab] = useState<FilterTab>("ACTIVE")
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  const _pickup = (id: string) => pickupLocations.find((p) => p.id === id)

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const counts = useMemo(() => {
    const all = orders
    return {
      active: all.filter((o) =>
        ACTIVE_STATUSES.includes(o.status as OrderStatus),
      ).length,
      pending: all.filter((o) => o.status === "PENDING").length,
      inProgress: all.filter((o) =>
        [
          "APPROVED",
          "PICKED_UP",
          "IN_WAREHOUSE",
          "IN_TRANSIT",
          "OUT_FOR_DELIVERY",
        ].includes(o.status as OrderStatus),
      ).length,
      issues: all.filter((o) =>
        ["FAILED_ATTEMPT", "RETURNED"].includes(o.status as OrderStatus),
      ).length,
    }
  }, [orders])

  const columns: DataTableColumn<Order>[] = [
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
      id: "receiver",
      header: columnLabels.order.receiver,
      sortable: true,
      sortValue: (o) => o.recipientName,
      cell: (o) => (
        <CellContent className="font-medium">{o.recipientName}</CellContent>
      ),
    },
    {
      id: "deliveryAddress",
      header: columnLabels.order.deliveryAddress,
      sortValue: (o) =>
        [o.deliveryCity, o.deliveryAddress].filter(Boolean).join(", "),
      cell: (o) => {
        const city = o.deliveryCity
        const address = o.deliveryAddress
        return (
          <CellContent>
            <span className="block">{city}</span>
            {address && (
              <span className="text-muted-foreground block text-xs">
                {address}
              </span>
            )}
          </CellContent>
        )
      },
    },
    {
      id: "status",
      header: columnLabels.order.status,
      sortable: true,
      sortValue: (o) => o.status,
      cell: (o) => (
        <Badge variant="secondary">{o.status.replace(/_/g, " ")}</Badge>
      ),
    },
    {
      id: "paymentStatus",
      header: "Payment",
      sortValue: (o) => {
        if (o.payoutRequestId) return "Paid"
        if (o.codSettledAt) return "COD settled"
        if (o.status === "DELIVERED") return "COD pending"
        return "Pending"
      },
      cell: (o) => {
        if (o.payoutRequestId) {
          return (
            <Badge variant="outline" className="text-green-600">
              Paid
            </Badge>
          )
        }
        if (o.codSettledAt) {
          return <Badge variant="secondary">COD settled</Badge>
        }
        if (o.status === "DELIVERED") {
          return <Badge variant="secondary">COD pending</Badge>
        }
        return <Badge variant="outline">Pending</Badge>
      },
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
                  href={`/track/${o.id}`}
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.merchant.orders.title}
        description={pageContent.merchant.orders.description}
      >
        <Button
          render={<Link href="/merchant/orders/new" />}
          nativeButton={false}
        >
          <Package className="size-4" />
          New order
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="merchant-orders"
            searchable
            searchColumns={["order", "receiver"]}
            toolbarLeft={
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="ACTIVE">
                      Active
                      {counts.active > 0 && (
                        <span className="bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 text-[10px] font-semibold">
                          {counts.active}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="PENDING">
                      Pending
                      {counts.pending > 0 && (
                        <span className="bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 text-[10px] font-semibold">
                          {counts.pending}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="IN_PROGRESS">
                      In progress
                      {counts.inProgress > 0 && (
                        <span className="bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 text-[10px] font-semibold">
                          {counts.inProgress}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="ISSUES">
                      Issues
                      {counts.issues > 0 && (
                        <span className="bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 text-[10px] font-semibold">
                          {counts.issues}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="ALL">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/merchant/orders/import" />}
                  nativeButton={false}
                  data-testid="bulk-import-open"
                >
                  <Upload className="size-4" />
                  Import CSV
                </Button>
              </div>
            }
            columns={columns}
            data={orders}
            getRowKey={(o) => o.id}
            emptyMessage="No orders match the current filters."
            loading={isLoading}
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
            onRefresh={refresh}
            initialSortId="createdAt"
            initialSortDir="desc"
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
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
    </div>
  )
}
