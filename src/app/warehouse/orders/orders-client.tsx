"use client"

import { Ban, Check, MoreHorizontal, ShieldCheck, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  codFeeColumn,
  collectibleColumn,
  createdAtColumn,
  deliveryAddressColumn,
  deliveryFeeColumn,
  deliveryRiderWithPhoneColumn,
  deliveryTypeColumn,
  merchantColumn,
  merchantNoteColumn,
  orderCodeColumn,
  orderLabelColumn,
  parcelWeightColumn,
  pickupRiderWithPhoneColumn,
  recipientNameColumn,
  recipientPhoneColumn,
  statusColumn,
} from "@/features/orders/components/order-table-columns"
import { ApproveOrderDialog } from "@/features/orders/dialogs/approve-order-dialog"
import { CancelOrderDialog } from "@/features/orders/dialogs/cancel-order-dialog"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePublishedLabelTemplate } from "@/features/platform-config/hooks/use-label-template"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { CANCELLABLE_ORDER_STATUSES } from "@/lib/constants"
import type { Order } from "@/lib/types"

/**
 * This queue is PENDING and nothing else (decision #2).
 *
 * It used to mirror the admin page's Pending/Approved/All trio, but every
 * other status now owns a page of its own: APPROVED onward live on the Ongoing
 * board, DELIVERED/CANCELLED/RETURNED on Completed, FAILED_ATTEMPT on
 * Exceptions. A tab here would be a second place to look for the same parcel,
 * and the warehouse admin's job on this page is a single question — what is
 * waiting for me to approve?
 */
const APPROVAL_STATUSES = ["PENDING"]

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
    mutate: refresh,
  } = useOrders({ initialData, initialTotal, includeAllOrders: true })
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  // The published parcel label, so this queue's print action matches the designer.
  const { template: labelTemplate } = usePublishedLabelTemplate()
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<Order | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)

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

  // Forced, not a default: nothing on this page may widen the queue. The
  // `setPage(1)` keeps a search made on page 3 from leaving the user staring at
  // an empty page 1 of results.
  useEffect(() => {
    setStatuses(APPROVAL_STATUSES)
    setPage(1)
  }, [setStatuses, setPage])

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "—"
  const riderPhone = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.phone ?? "—") : "—"

  const columns: DataTableColumn<Order>[] = [
    orderCodeColumn(),
    merchantColumn(merchantName),
    recipientNameColumn(),
    recipientPhoneColumn(),
    parcelWeightColumn(),
    pickupRiderWithPhoneColumn(riderName, riderPhone),
    deliveryAddressColumn(),
    deliveryTypeColumn(),
    collectibleColumn(),
    deliveryFeeColumn(),
    codFeeColumn(),
    merchantNoteColumn(),
    statusColumn(),
    deliveryRiderWithPhoneColumn(riderName, riderPhone),
    createdAtColumn(),
    orderLabelColumn(merchantName, labelTemplate),
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => {
        const canApprove = o.status === "PENDING"
        const canCancel = CANCELLABLE_ORDER_STATUSES.includes(o.status)
        return (
          <div className="flex justify-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    // Same id pattern as the admin orders table — the menu is
                    // per-row, so an unqualified "Actions" is ambiguous on any
                    // list with more than one order.
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
                    data-testid={`order-review-${o.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setApproveTarget(o)
                      setApproveOpen(true)
                    }}
                  >
                    <ShieldCheck className="size-4" />
                    Review order
                  </DropdownMenuItem>
                )}
                {canApprove && canCancel && <DropdownMenuSeparator />}
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

      {/* No stat cards here: the warehouse overview owns the counts now, and a
          second copy of "how many are pending" on the page that lists the
          pending orders is a number that can disagree with its own table. */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["order"]}
            id="warehouse-orders"
            searchable
            columns={columns}
            data={orders}
            getRowKey={(o) => o.id}
            emptyMessage="No orders are waiting for approval."
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
                label: "Approve",
                icon: <Check className="size-4" />,
                disabled: bulkBusy,
                onClick: async (rows, clear) => {
                  // Same filter as the admin table: only PENDING rows go to
                  // the endpoint, so a mixed selection approves what it can
                  // rather than failing the whole batch.
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
                onClick: async (rows: Order[], clear: () => void) => {
                  await handleBulkCancel(
                    rows
                      .filter((o) =>
                        CANCELLABLE_ORDER_STATUSES.includes(o.status),
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

      <ApproveOrderDialog
        order={approveTarget}
        open={approveOpen}
        onOpenChange={(open) => {
          setApproveOpen(open)
          if (!open) setApproveTarget(null)
        }}
      />

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
