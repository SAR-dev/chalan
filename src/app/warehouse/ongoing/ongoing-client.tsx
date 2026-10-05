"use client"

import {
  Bike,
  MapPin,
  Package,
  PackagePlus,
  Search,
  Send,
  Sparkles,
  Weight,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  type BoardCity,
  OngoingFilterBar,
} from "@/features/orders/components/ongoing-filter-bar"
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge"
import { AssignPickupRiderDialog } from "@/features/orders/dialogs/assign-pickup-rider-dialog"
import { AutoAssignDialog } from "@/features/orders/dialogs/auto-assign-dialog"
import { OrderDetailsDrawer } from "@/features/orders/dialogs/order-details-drawer"
import { WarehouseDispatchDialog } from "@/features/orders/dialogs/warehouse-dispatch-dialog"
import { WarehouseReceiveDialog } from "@/features/orders/dialogs/warehouse-receive-dialog"
import {
  type BoardColumn,
  groupOngoingByRider,
  groupOngoingByStatus,
  inWarehouseIds,
  nextLegRiderId,
} from "@/features/orders/kanban-grouping"
import {
  filterOngoingOrders,
  isFiltering,
  NO_ONGOING_FILTERS,
  type OngoingFilters,
} from "@/features/orders/ongoing-filters"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"

type GroupMode = "status" | "riders"

const TRUNCATION_NOTICE =
  "Showing the 500 oldest ongoing parcels. Narrow the board with the filters above, or check Completed for the rest."

const NO_MATCHES_NOTICE =
  "No ongoing parcels match these filters. Clear them to see the whole board."

/**
 * One parcel. Deliberately not drag-and-drop: moving a card between columns
 * reads as "change this parcel's status", and every status move here is a
 * server-validated transition with its own dialog and audit trail. A drag that
 * looked like it worked but wrote the wrong thing would be worse than no drag at
 * all, so the board offers the action buttons and nothing else.
 */
function OrderCard({
  order,
  holderName,
  onOpen,
  onReceive,
  onAssignPickup,
  onDispatch,
}: {
  order: Order
  holderName: string
  onOpen: () => void
  onReceive: () => void
  onAssignPickup: () => void
  onDispatch: () => void
}) {
  // The pickup action renders for *every* APPROVED parcel, not only the
  // unassigned ones. A dispatcher scanning a lane needs to see at a glance
  // which parcels are covered as much as which are not — and a card that
  // silently loses its action button reads as a broken card rather than as
  // "already assigned".
  const showsPickupAction = order.status === "APPROVED"
  const pickupAssigned = showsPickupAction && !!order.pickupRiderId
  const canReceive = order.status === "PICKED_UP"
  const canDispatch = order.status === "IN_WAREHOUSE"

  return (
    <div
      data-testid={`kanban-card-${order.id}`}
      className="bg-card space-y-2.5 rounded-lg border p-3 shadow-xs"
    >
      <button
        type="button"
        data-testid={`kanban-open-${order.id}`}
        onClick={onOpen}
        className="text-primary hover:underline focus:outline-none"
      >
        <span className="font-mono text-xs font-medium">{order.id}</span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        <OrderStatusBadge status={order.status} size="sm" />
      </div>

      <p className="truncate text-sm font-medium">{order.recipientName}</p>

      <dl className="text-muted-foreground space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <MapPin className="size-3 shrink-0" />
          <dd className="truncate">{order.deliveryCity ?? "—"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Weight className="size-3 shrink-0" />
          <dd className="tabular-nums">{order.parcelWeightKg} kg</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Package className="size-3 shrink-0" />
          <dd className="tabular-nums">
            {formatTk(Number(order.productCost ?? 0))}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Bike className="size-3 shrink-0" />
          <dd className="truncate">{holderName}</dd>
        </div>
      </dl>

      {showsPickupAction && (
        <Button
          size="sm"
          className="w-full"
          // Same testid in both states: this is one control with a value, not
          // two controls. A spec distinguishes the states with `toBeDisabled()`
          // rather than with a differently-named element.
          data-testid={`kanban-assign-pickup-${order.id}`}
          disabled={pickupAssigned}
          onClick={onAssignPickup}
        >
          <Bike className="size-4" />
          {pickupAssigned ? "Pickup Assigned" : "Assign pickup"}
        </Button>
      )}
      {canReceive && (
        <Button
          size="sm"
          className="w-full"
          data-testid={`kanban-receive-${order.id}`}
          onClick={onReceive}
        >
          <PackagePlus className="size-4" />
          Receive
        </Button>
      )}
      {canDispatch && (
        <Button
          size="sm"
          className="w-full"
          data-testid={`kanban-dispatch-${order.id}`}
          onClick={onDispatch}
        >
          <Send className="size-4" />
          Dispatch
        </Button>
      )}
    </div>
  )
}

export function WarehouseOngoingPageClient({
  initialData,
  truncated,
  cities,
}: {
  initialData: Order[]
  truncated: boolean
  cities: BoardCity[]
}) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const { riders, warehouseDeliveryRiders } = useRiders()
  const { merchants } = useMerchants()
  const [mode, setMode] = useState<GroupMode>("status")
  const [filters, setFilters] = useState<OngoingFilters>(NO_ONGOING_FILTERS)
  const [receiveTarget, setReceiveTarget] = useState<Order | null>(null)
  const [assignTarget, setAssignTarget] = useState<Order | null>(null)
  const [dispatchTarget, setDispatchTarget] = useState<Order | null>(null)
  const [autoAssignOpen, setAutoAssignOpen] = useState(false)
  const [viewOrderCode, setViewOrderCode] = useState<string | null>(null)

  const warehouseName = currentWarehouse?.name ?? "your warehouse"

  // Filtered first, grouped second: the columns then describe what is on screen,
  // so a lane header never counts parcels the board is not showing. Columns are
  // still created for every status/rider, so narrowing the board never makes the
  // lanes jump around under the cursor.
  const visible = useMemo(
    () => filterOngoingOrders(initialData, filters),
    [initialData, filters],
  )

  const columns = useMemo<BoardColumn[]>(
    () =>
      mode === "status"
        ? groupOngoingByStatus(visible)
        : groupOngoingByRider(visible, riders),
    [mode, visible, riders],
  )

  // Auto-assign is offered only when there is something legal to plan. Showing a
  // button that opens a dialog explaining there is nothing to dispatch is worse
  // than not offering it.
  //
  // Deliberately planned over *every* in-warehouse parcel, not the filtered
  // ones: the plan reassigns riders across the warehouse, so quietly planning
  // over whatever survived a filter would move parcels the dispatcher is not
  // even looking at.
  const autoAssignIds = useMemo(
    () => inWarehouseIds(initialData),
    [initialData],
  )

  const filtering = isFiltering(filters)

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Merchant"
  const riderName = (id?: string | null) =>
    id ? (riders.find((r) => r.id === id)?.name ?? "—") : "Unassigned"

  function holderOf(order: Order) {
    return riderName(nextLegRiderId(order))
  }

  function closeReceive() {
    setReceiveTarget(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.ongoing.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.ongoing.description(warehouseName)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as GroupMode)}
          data-testid="kanban-groupby"
        >
          <TabsList>
            <TabsTrigger value="status" data-testid="kanban-groupby-status">
              By status
            </TabsTrigger>
            <TabsTrigger value="riders" data-testid="kanban-groupby-riders">
              By riders
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {autoAssignIds.length > 0 && (
          <Button
            variant="outline"
            data-testid="bulk-auto-assign"
            onClick={() => setAutoAssignOpen(true)}
          >
            <Sparkles className="size-4" />
            Auto-assign riders
          </Button>
        )}
      </div>

      {/* Hidden only when there is nothing to filter *and* nothing filtering.
          Otherwise the Clear control would vanish with the board and leave a
          narrowed view that cannot be widened again. */}
      {(initialData.length > 0 || filtering) && (
        <OngoingFilterBar
          filters={filters}
          onChange={setFilters}
          riders={riders}
          cities={cities}
        />
      )}

      {truncated && (
        <p
          data-testid="kanban-truncated"
          className="border-border bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-sm"
        >
          {TRUNCATION_NOTICE}
        </p>
      )}

      {initialData.length === 0 && (
        // The columns render either way — an empty column is itself the answer
        // to "is anything waiting to be received?" — so this is a summary above
        // the board rather than a replacement for it.
        <p data-testid="kanban-empty" className="text-muted-foreground text-sm">
          No ongoing parcels. Nothing is waiting to be picked up, received or
          dispatched.
        </p>
      )}

      {/* Distinct from `kanban-empty`: there ARE parcels, this filter just hides
          all of them. Offering no way back from that state is how people end up
          believing the board is empty. */}
      {initialData.length > 0 && visible.length === 0 && filtering && (
        <p
          data-testid="kanban-no-matches"
          className="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <Search className="size-4 shrink-0" />
          {NO_MATCHES_NOTICE}
        </p>
      )}

      <div
        data-testid="kanban-board"
        className="flex gap-4 overflow-x-auto pb-2"
      >
        {columns.map((column) => (
          <section
            key={column.id}
            data-testid={`kanban-column-${column.id}`}
            className="bg-muted/40 flex w-72 shrink-0 flex-col rounded-lg p-3"
          >
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{column.label}</h2>
              <span
                data-testid={`kanban-count-${column.id}`}
                className="bg-background text-muted-foreground rounded-full px-2 py-0.5 text-xs tabular-nums"
              >
                {column.orders.length}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-2">
              {column.orders.length === 0 ? (
                <p className="text-muted-foreground px-1 py-2 text-xs">
                  Nothing here.
                </p>
              ) : (
                column.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    holderName={holderOf(order)}
                    onOpen={() => setViewOrderCode(order.id)}
                    onReceive={() => setReceiveTarget(order)}
                    onAssignPickup={() => setAssignTarget(order)}
                    onDispatch={() => setDispatchTarget(order)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <WarehouseReceiveDialog
        order={receiveTarget}
        merchantName={
          receiveTarget ? merchantName(receiveTarget.merchantId) : ""
        }
        riderName={receiveTarget ? riderName(receiveTarget.pickupRiderId) : ""}
        warehouseName={warehouseName}
        open={receiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeReceive()
        }}
      />

      <AssignPickupRiderDialog
        order={assignTarget}
        warehouseName={warehouseName}
        open={assignTarget !== null}
        onOpenChange={(open) => {
          setAssignTarget(null)
          if (!open) router.refresh()
        }}
      />

      <WarehouseDispatchDialog
        order={dispatchTarget}
        merchantName={
          dispatchTarget ? merchantName(dispatchTarget.merchantId) : ""
        }
        warehouseName={warehouseName}
        deliveryRiders={warehouseDeliveryRiders}
        open={dispatchTarget !== null}
        onOpenChange={(open) => {
          setDispatchTarget(null)
          if (!open) router.refresh()
        }}
      />

      <AutoAssignDialog
        ids={autoAssignIds}
        open={autoAssignOpen}
        onOpenChange={setAutoAssignOpen}
        onComplete={() => router.refresh()}
      />

      <OrderDetailsDrawer
        orderCode={viewOrderCode}
        open={viewOrderCode !== null}
        onOpenChange={(open) => {
          if (!open) setViewOrderCode(null)
        }}
      />
    </div>
  )
}
