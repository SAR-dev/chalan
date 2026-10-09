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
import { formatDateTime } from "@/lib/format"
import { formatTk } from "@/lib/pricing"
import type { Order, OrderStatus } from "@/lib/types"

type FilterTab = "ACTIVE" | "PENDING" | "IN_PROGRESS" | "ISSUES" | "ALL"

const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "OUT_FOR_PICKUP",
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
    "OUT_FOR_PICKUP",
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
    allOrders,
    total,
    setPage,
    setLimit,
    query,
    setQuery,
    statuses: _statuses,
    setStatuses,
    isLoading,
    isRefreshing,
    sortId,
    sortDir,
    onSortChange,
    mutate: refresh,
  } = useOrders({
    // The tab badges count across every status, which the paginated list
    // (filtered to the active tab, one page at a time) cannot give.
    includeAllOrders: true,
  })

  const [tab, setTab] = useState<FilterTab>("ACTIVE")
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  // `allOrders` is the unfiltered (all-status) set, so a tab badge counts real
  // rows rather than the single page the table happens to be showing. While a
  // search is running the badges reflect it, so a zero is a real answer.
  const counts = useMemo(() => {
    if (query) {
      const searched = allOrders
      return {
        active: searched.filter((o) =>
          ACTIVE_STATUSES.includes(o.status as OrderStatus),
        ).length,
        pending: searched.filter((o) => o.status === "PENDING").length,
        inProgress: searched.filter((o) =>
          [
            "APPROVED",
            "OUT_FOR_PICKUP",
            "PICKED_UP",
            "IN_WAREHOUSE",
            "IN_TRANSIT",
            "OUT_FOR_DELIVERY",
          ].includes(o.status as OrderStatus),
        ).length,
        issues: searched.filter((o) =>
          ["FAILED_ATTEMPT", "RETURNED"].includes(o.status as OrderStatus),
        ).length,
      }
    }

    const all = allOrders
    return {
      active: all.filter((o) =>
        ACTIVE_STATUSES.includes(o.status as OrderStatus),
      ).length,
      pending: all.filter((o) => o.status === "PENDING").length,
      inProgress: all.filter((o) =>
        [
          "APPROVED",
          "OUT_FOR_PICKUP",
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
  }, [allOrders, query])

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
      // What the merchant said is in the parcel. Not sortable: it is free text
      // they typed, so an ORDER BY would be alphabetical noise ("Cotton saree"
      // next to "charger") rather than a grouping anyone scans for.
      id: "itemType",
      header: columnLabels.order.itemType,
      headClassName: "hidden lg:table-cell",
      cellClassName: "hidden lg:table-cell",
      cell: (o) =>
        o.itemType ? (
          <CellContent>{o.itemType}</CellContent>
        ) : (
          // Reads as an empty value rather than a blank cell, which is
          // indistinguishable from one that failed to load.
          <CellContent className="text-muted-foreground">
            Not stated
          </CellContent>
        ),
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
      id: "expectedDelivery",
      header: columnLabels.order.expectedDelivery,
      sortable: true,
      // Sorted as a string: ISO instants sort chronologically, and an
      // unquoted lane (null) must sort after every real date rather than
      // before it — hence the space-prefixed fallback.
      sortValue: (o) => o.expectedDeliveryAt ?? " ",
      cell: (o) =>
        o.expectedDeliveryAt ? (
          <CellContent>
            {formatDateTime(o.expectedDeliveryAt, { dateStyle: "medium" })}
          </CellContent>
        ) : (
          // No configured delivery time for the lane: shown as absent, never
          // as a guessed date.
          <span className="text-muted-foreground">—</span>
        ),
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
            loading={isLoading || isRefreshing}
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
