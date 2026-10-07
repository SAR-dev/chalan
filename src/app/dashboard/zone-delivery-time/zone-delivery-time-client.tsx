"use client"

import { LayoutGrid, List, MoreHorizontal, Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellContent,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ZoneDeliveryTimeMatrix } from "@/features/platform-config/components/zone-delivery-time-matrix"
import { CreateZoneDeliveryTimeDialog } from "@/features/platform-config/dialogs/create-zone-delivery-time-dialog"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZoneDeliveryTime } from "@/features/platform-config/hooks/use-zone-delivery-time"
import { toast } from "@/lib/notify"
import type { ZoneDeliveryTime } from "@/lib/types"

/**
 * Which view of the same lane table is on screen.
 *
 * The list is the default and stays the home of the row actions (add, edit,
 * delete), because that is where an admin lands to *change* a lane. The matrix
 * answers the coverage question — "which zone pairs are missing a promise?" —
 * and, unlike the pricing matrix, is admin-only, so its selected cell can offer
 * edit/delete too without any read-only split.
 */
type DeliveryTimeView = "list" | "matrix"

export function ZoneDeliveryTimePageClient() {
  const { zones } = useDeliveryZones()
  const {
    rows,
    isLoading,
    isRefreshing,
    deleteDeliveryTime,
    mutate: refresh,
  } = useZoneDeliveryTime()
  const [view, setView] = useState<DeliveryTimeView>("list")
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ZoneDeliveryTime | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ZoneDeliveryTime | null>(
    null,
  )
  const [deleteOpen, setDeleteOpen] = useState(false)

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id

  async function handleDelete() {
    if (!deleteTarget) return
    const result = await deleteDeliveryTime(deleteTarget.id)
    setDeleteOpen(false)
    setDeleteTarget(null)
    if (!result.ok) return toast.error(result.error)
    toast.success(
      `Delivery time for ${zoneName(deleteTarget.fromZoneId)} → ${zoneName(
        deleteTarget.toZoneId,
      )} removed. This lane shows no estimate again.`,
    )
  }

  const columns: DataTableColumn<ZoneDeliveryTime>[] = [
    {
      id: "fromZone",
      header: "From Zone",
      sortable: true,
      sortValue: (r) => zoneName(r.fromZoneId),
      cell: (r) => (
        <CellContent className="font-medium">
          {zoneName(r.fromZoneId)}
        </CellContent>
      ),
    },
    {
      id: "toZone",
      header: "To Zone",
      sortable: true,
      sortValue: (r) => zoneName(r.toZoneId),
      cell: (r) => (
        <CellContent className="font-medium">
          {zoneName(r.toZoneId)}
        </CellContent>
      ),
    },
    {
      id: "deliveryDays",
      header: "Delivery Days",
      sortable: true,
      sortValue: (r) => r.deliveryDays,
      align: "right",
      cell: (r) => (
        <CellContent className="tabular-nums">
          {r.deliveryDays === 1 ? "1 day" : `${r.deliveryDays} days`}
        </CellContent>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (r) => (
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
              <DropdownMenuItem
                data-testid={`zone-delivery-time-edit-${r.id}`}
                onSelect={() => setEditing(r)}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                data-testid={`zone-delivery-time-delete-${r.id}`}
                onSelect={() => {
                  setDeleteTarget(r)
                  setDeleteOpen(true)
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Zone Delivery Times"
        description="Days from order creation to delivery, per zone pair. An unconfigured lane shows no estimate and does not block an order."
      >
        <Button
          data-testid="zone-delivery-time-add"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Add delivery time
        </Button>
      </PageHeader>

      {/* Sits above the card, not inside either view. Inside the table toolbar
          it would disappear the moment the matrix was selected, leaving no way
          back. */}
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as DeliveryTimeView)}
        className="w-fit"
      >
        <TabsList>
          <TabsTrigger value="list" data-testid="zone-delivery-time-view-list">
            <List className="size-4" />
            List
          </TabsTrigger>
          <TabsTrigger
            value="matrix"
            data-testid="zone-delivery-time-view-matrix"
          >
            <LayoutGrid className="size-4" />
            Matrix
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {view === "list" ? (
            <div data-testid="zone-delivery-time-list-view">
              <DataTable
                pinnedColumns={["fromZone"]}
                id="zone-delivery-time"
                columns={columns}
                data={rows}
                getRowKey={(r) => r.id}
                loading={isLoading || isRefreshing}
                onRefresh={refresh}
                emptyMessage="No delivery times yet. Add one to give this lane an estimate."
              />
            </div>
          ) : // `rows` is `[]` until the first fetch resolves, so gating on
          // loading is what stops the matrix from claiming there are no lanes
          // configured when in fact they simply have not arrived yet. Revalidating
          // an already-rendered grid keeps showing it — blanking it every refresh
          // would blink the matrix.
          isLoading ? (
            <p
              className="text-muted-foreground px-6 py-10 text-center text-sm"
              data-testid="zone-delivery-time-matrix-loading"
            >
              Loading delivery times…
            </p>
          ) : (
            <div className="p-6">
              <ZoneDeliveryTimeMatrix
                zones={zones}
                rows={rows}
                onEdit={(r) => setEditing(r)}
                onDelete={(r) => {
                  setDeleteTarget(r)
                  setDeleteOpen(true)
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <CreateZoneDeliveryTimeDialog
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete delivery time"
        description={
          deleteTarget
            ? `Remove the delivery time for ${zoneName(
                deleteTarget.fromZoneId,
              )} → ${zoneName(
                deleteTarget.toZoneId,
              )}? Orders on it will show no estimate until a time is set again.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          await handleDelete()
        }}
      />
    </div>
  )
}
