"use client"

import {
  Banknote,
  HandCoins,
  Loader2,
  MoreHorizontal,
  Wallet,
} from "lucide-react"
import { useMemo, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellContent,
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
import {
  deliveryAddressColumn,
  deliveryRiderColumn,
  merchantColumn,
  orderCodeColumn,
  settledByColumn,
} from "@/features/orders/components/order-table-columns"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { toast } from "@/lib/notify"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

type FilterTab = "UNSETTLED" | "SETTLED"

export function WarehouseSettlementPageClient({
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
    warehouseUnsettledOrders,
    settleOrderCod,
    bulkSettleCod,
    isLoading,
    isRefreshing,
    mutate: refresh,
  } = useOrders({ initialData, initialTotal })
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const [tab, setTab] = useState<FilterTab>("UNSETTLED")
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [settling, setSettling] = useState<string | null>(null)
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bulkSettleOpen, setBulkSettleOpen] = useState(false)
  const [bulkSettleIds, setBulkSettleIds] = useState<string[]>([])

  async function handleBulkSettle(ids: string[]) {
    setBulkSettleIds(ids)
    setBulkSettleOpen(true)
  }

  async function confirmBulkSettle() {
    setBulkBusy(true)
    const res = await bulkSettleCod(bulkSettleIds)
    if (res.ok) {
      toast.success(
        `${bulkSettleIds.length} order${bulkSettleIds.length === 1 ? "" : "s"} settled.`,
      )
    } else {
      toast.error(res.error ?? "Could not settle orders.")
    }
    setBulkBusy(false)
    setBulkSettleOpen(false)
    setBulkSettleIds([])
  }

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"

  const unsettledCount = warehouseUnsettledOrders

  const settled = useMemo(
    () =>
      currentWarehouse
        ? orders.filter(
            (o) =>
              o.warehouseId === currentWarehouse.id &&
              o.status === "DELIVERED" &&
              Boolean(o.codSettledAt),
          )
        : [],
    [orders, currentWarehouse],
  )

  const unsettledOrdersList = useMemo(
    () =>
      currentWarehouse
        ? orders.filter(
            (o) =>
              o.warehouseId === currentWarehouse.id &&
              o.status === "DELIVERED" &&
              !o.codSettledAt,
          )
        : [],
    [orders, currentWarehouse],
  )

  const unsettledCash = unsettledOrdersList.reduce(
    (sum, o) => sum + (o.amountCollected ?? o.productCost),
    0,
  )
  const settledCash = settled.reduce(
    (sum, o) => sum + (o.amountCollected ?? o.productCost),
    0,
  )

  const visible = tab === "UNSETTLED" ? unsettledOrdersList : settled

  function openConfirm(order: Order) {
    setConfirmOrder(order)
    setConfirmOpen(true)
  }

  async function handleConfirm() {
    if (!confirmOrder) return
    setSettling(confirmOrder.id)
    try {
      const result = await settleOrderCod(confirmOrder.id)
      if (result.ok) {
        toast.success(
          `${confirmOrder.id} settled. COD amount is now available for merchant payout.`,
        )
      } else {
        toast.error(result.error ?? "Unable to settle this parcel.")
      }
    } finally {
      setSettling(null)
      setConfirmOpen(false)
      setConfirmOrder(null)
    }
  }

  const columns: DataTableColumn<Order>[] = [
    orderCodeColumn(),
    merchantColumn(merchantName),
    deliveryAddressColumn(),
    deliveryRiderColumn(riderName),
    {
      id: "collected",
      header: columnLabels.codSettlement.cashCollected,
      align: "right",
      sortable: true,
      sortValue: (o) => o.amountCollected ?? o.productCost,
      cell: (o) => (
        <CellContent className="font-medium tabular-nums">
          {formatTk(o.amountCollected ?? o.productCost)}
        </CellContent>
      ),
    },
    settledByColumn(),
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => (
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
              {o.codSettledAt ? (
                <DropdownMenuItem disabled>No actions</DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => openConfirm(o)}
                  disabled={settling === o.id}
                >
                  {settling === o.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <HandCoins className="size-4" />
                  )}
                  Settle cash
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.codSettlement.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.codSettlement.description}
      />

      <StatCardList
        items={[
          {
            label:
              statCardLabels.warehouse.codSettlement.awaitingSettlement.label,
            value: unsettledCount,
            icon: HandCoins,
            tone: "bg-chart-3/15 text-chart-3",
          },
          {
            label: statCardLabels.warehouse.codSettlement.cashToCollect.label,
            value: formatTk(unsettledCash),
            icon: Banknote,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.warehouse.codSettlement.settledCash.label,
            value: formatTk(settledCash),
            icon: Wallet,
            tone: "bg-chart-2/15 text-chart-2",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="warehouse-settlement"
            searchable
            searchColumns={["order", "merchant", "deliveryRider"]}
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="UNSETTLED">
                    Awaiting settlement
                  </TabsTrigger>
                  <TabsTrigger value="SETTLED">Settled</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={visible}
            getRowKey={(o) => o.id}
            initialSortId="order"
            loading={isLoading || isRefreshing}
            emptyMessage={
              tab === "UNSETTLED"
                ? "Nothing to settle. Delivered parcels appear here until their COD is settled."
                : "No settlements yet."
            }
            onRefresh={refresh}
            bulkLoading={bulkBusy}
            selectedKeys={selectedOrders}
            onSelectionChange={setSelectedOrders}
            bulkActions={
              tab === "UNSETTLED"
                ? [
                    {
                      label: "Settle cash",
                      icon: <HandCoins className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (rows: Order[], clear: () => void) => {
                        await handleBulkSettle(
                          rows.filter((o) => !o.codSettledAt).map((o) => o.id),
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Settle cash on delivery"
        description={`Settle ${confirmOrder?.id} for ${formatTk(confirmOrder?.amountCollected ?? confirmOrder?.productCost ?? 0)}? This marks the COD as settled and makes it available for merchant payout.`}
        confirmLabel="Settle"
        loading={settling !== null}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={bulkSettleOpen}
        onOpenChange={setBulkSettleOpen}
        title="Settle cash on delivery"
        description={`Settle ${bulkSettleIds.length} order${bulkSettleIds.length === 1 ? "" : "s"}? This marks the COD as settled and makes it available for merchant payout.`}
        confirmLabel="Settle"
        loading={bulkBusy}
        onConfirm={confirmBulkSettle}
      />
    </div>
  )
}
