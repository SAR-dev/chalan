"use client"

import { MoreHorizontal, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
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
import { CreateZoneDeliveryTimeDialog } from "@/features/platform-config/dialogs/create-zone-delivery-time-dialog"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZoneDeliveryTime } from "@/features/platform-config/hooks/use-zone-delivery-time"
import type { ZoneDeliveryTime } from "@/lib/types"

/**
 * The zone-to-zone delivery-time matrix, as a list.
 *
 * Deliberately list-only, unlike Zone Pricing's list/matrix pair: that matrix
 * exists to answer "which lanes am I *missing*?", which needs both endpoints of
 * every pair on screen at once. This page starts from an empty table and grows,
 * so the missing lanes are simply the rows not yet present — a coverage grid
 * would need the full zone × zone cross product generated client-side, and is
 * worth adding when this list stops being a page someone visits twice.
 */
export function ZoneDeliveryTimePageClient() {
  const { zones } = useDeliveryZones()
  const {
    rows,
    isLoading,
    isRefreshing,
    deleteDeliveryTime,
    mutate: refresh,
  } = useZoneDeliveryTime()
  const [createOpen, setCreateOpen] = useState(false)
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
    toast.success("Delivery time removed. This lane shows no estimate again.")
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
        <CellContent className="tabular-nums">{r.deliveryDays}</CellContent>
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
                variant="destructive"
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

      <Card>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>

      <CreateZoneDeliveryTimeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete delivery time"
        description="Remove this lane's delivery time? Orders on it will show no estimate until a time is set again."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          await handleDelete()
        }}
      />
    </div>
  )
}
