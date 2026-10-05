"use client"

import { useEffect, useState } from "react"
import {
  CellContent,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { COMPLETED_STATUSES } from "@/features/orders/completed-statuses"
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge"
import {
  deliveryAddressColumn,
  merchantColumn,
} from "@/features/orders/components/order-table-columns"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { formatDateTime } from "@/lib/format"
import { formatTk } from "@/lib/pricing"
import type { Order, OrderStatus } from "@/lib/types"

type CompletedTab = "DELIVERED" | "CANCELLED" | "RETURNED" | "ALL"

/**
 * Tabs narrow the *server* query rather than filtering the rendered page, so a
 * warehouse with thousands of closed parcels paginates correctly instead of
 * showing whichever 20 happened to be on page 1.
 */
const TAB_STATUSES: Record<CompletedTab, OrderStatus[] | undefined> = {
  DELIVERED: ["DELIVERED"],
  CANCELLED: ["CANCELLED"],
  RETURNED: ["RETURNED"],
  ALL: [...COMPLETED_STATUSES],
}

export function WarehouseCompletedPageClient({
  initialData,
  initialTotal,
}: {
  initialData: Order[]
  initialTotal: number
}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const {
    orders,
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
  const [tab, setTab] = useState<CompletedTab>("ALL")

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"

  const columns: DataTableColumn<Order>[] = [
    {
      id: "order",
      header: columnLabels.order.order,
      sortable: true,
      sortValue: (o) => o.id,
      cell: (o) => (
        <div className="space-y-1">
          <p className="font-mono font-medium">{o.id}</p>
          <OrderStatusBadge status={o.status} size="sm" />
        </div>
      ),
    },
    merchantColumn(merchantName),
    {
      id: "recipient",
      header: columnLabels.order.receiver,
      sortable: true,
      sortValue: (o) => o.recipientName,
      cell: (o) => <CellContent>{o.recipientName}</CellContent>,
    },
    deliveryAddressColumn(),
    {
      id: "closedAt",
      header: columnLabels.order.closedAt,
      sortable: true,
      // Sorted on whichever timestamp actually closed the parcel, so the column
      // reads chronologically across a mixed list rather than sorting on a
      // mostly-null field.
      sortValue: (o) => o.deliveredAt ?? o.returnedAt ?? o.cancelledAt ?? "",
      cell: (o) => (
        <CellContent className="text-muted-foreground">
          {formatDateTime(o.deliveredAt ?? o.returnedAt ?? o.cancelledAt)}
        </CellContent>
      ),
    },
    {
      id: "outcome",
      header: columnLabels.exceptions.resolution,
      cellClassName: "whitespace-normal align-top",
      // Carried over from the Exceptions page, which used to own RETURNED. Only
      // a returned parcel has a reason; delivered and cancelled rows show an
      // explicit dash rather than an empty cell, so "no reason recorded" does
      // not look like a rendering bug.
      sortValue: (o) =>
        o.status === "RETURNED" ? (o.returnReason ?? "—") : "—",
      cell: (o) =>
        o.status === "RETURNED" ? (
          <CellContent className="text-muted-foreground max-w-48">
            {o.returnReason ?? "—"}
          </CellContent>
        ) : (
          <CellContent className="text-muted-foreground">—</CellContent>
        ),
    },
    {
      id: "resolvedBy",
      header: columnLabels.order.resolvedBy,
      sortValue: (o) =>
        o.status === "RETURNED" ? (o.failedResolvedBy ?? "—") : "—",
      cell: (o) => (
        <CellContent className="text-muted-foreground">
          {o.status === "RETURNED" ? (o.failedResolvedBy ?? "—") : "—"}
        </CellContent>
      ),
    },
    {
      id: "collectible",
      header: columnLabels.order.collectible,
      align: "right",
      sortable: true,
      sortValue: (o) => Number(o.amountCollected ?? 0),
      cell: (o) => (
        <CellContent className="tabular-nums">
          {formatTk(Number(o.amountCollected ?? 0))}
        </CellContent>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.completed.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.completed.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <Card>
        <CardContent className="p-0">
          {/* Read-only by construction: no actions column, no selection, no
              bulkActions. A closed parcel has nothing left to do to it, so
              there is nothing here to offer. */}
          <DataTable
            pinnedColumns={["order"]}
            id="warehouse-completed"
            searchable
            searchColumns={["order", "merchant", "recipient", "deliveryCity"]}
            toolbarLeft={
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as CompletedTab)}
              >
                <TabsList>
                  <TabsTrigger value="ALL" data-testid="completed-tab-ALL">
                    All
                  </TabsTrigger>
                  <TabsTrigger
                    value="DELIVERED"
                    data-testid="completed-tab-DELIVERED"
                  >
                    Delivered
                  </TabsTrigger>
                  <TabsTrigger
                    value="CANCELLED"
                    data-testid="completed-tab-CANCELLED"
                  >
                    Cancelled
                  </TabsTrigger>
                  <TabsTrigger
                    value="RETURNED"
                    data-testid="completed-tab-RETURNED"
                  >
                    Returned
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={orders}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading || isRefreshing}
            emptyMessage="No closed parcels match this view."
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
    </div>
  )
}
