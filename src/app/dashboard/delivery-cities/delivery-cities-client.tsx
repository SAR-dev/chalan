"use client"

import { MoreHorizontal, Plus, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellContent,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreateDeliveryCityDialog } from "@/features/platform-config/dialogs/create-delivery-city-dialog"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { DeliveryCity } from "@/lib/types"

export function DeliveryCitiesPageClient() {
  const {
    cities,
    isLoading,
    isRefreshing,
    toggleCity,
    deleteCity,
    mutate: refresh,
  } = useDeliveryCities()
  const { zones } = useDeliveryZones()
  const { warehouses } = useWarehouses()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryCity | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function zoneName(id: string) {
    return zones.find((z) => z.id === id)?.name ?? id
  }

  function warehouseName(id: string) {
    const w = warehouses.find((wh) => wh.id === id)
    return w ? `${w.name} - ${w.city}` : id
  }

  async function handleToggleActive(city: DeliveryCity) {
    const result = await toggleCity(city.id, !city.isActive)
    if (!result.ok) return toast.error(result.error)
    toast.success(
      `${city.name} ${city.isActive ? "deactivated" : "activated"}.`,
    )
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const result = await deleteCity(deleteTarget.id)
    setDeleteOpen(false)
    setDeleteTarget(null)
    if (!result.ok) return toast.error(result.error)
    toast.success(`${deleteTarget.name} deactivated.`)
  }

  const columns: DataTableColumn<DeliveryCity>[] = [
    {
      id: "name",
      header: "City name",
      sortValue: (o) => o.name,
      cell: (o) => <CellContent className="font-medium">{o.name}</CellContent>,
    },
    {
      id: "zone",
      header: "Zone",
      sortValue: (o) => (o.zoneId ? zoneName(o.zoneId) : "—"),
      cell: (o) => (
        <CellContent>{o.zoneId ? zoneName(o.zoneId) : "—"}</CellContent>
      ),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (o) => (o.warehouseId ? warehouseName(o.warehouseId) : "—"),
      cell: (o) => (
        <CellContent>
          {o.warehouseId ? warehouseName(o.warehouseId) : "—"}
        </CellContent>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (o) => (o.isActive ? "Active" : "Inactive"),
      cell: (o) =>
        o.isActive ? (
          <Badge variant="outline" className="gap-1 text-green-600">
            <ShieldCheck className="size-3" />
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        ),
    },
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
              <DropdownMenuItem onSelect={() => handleToggleActive(o)}>
                {o.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              {!o.isActive && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    setDeleteTarget(o)
                    setDeleteOpen(true)
                  }}
                >
                  Delete
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
        title="Delivery Cities"
        description="Manage the list of cities merchants can select when creating orders."
      >
        <Button data-testid="add-city" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Add City
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="delivery-cities"
            columns={columns}
            data={cities}
            getRowKey={(o) => o.id}
            loading={isLoading || isRefreshing}
            onRefresh={refresh}
            emptyMessage="No delivery cities yet. Add one to get started."
          />
        </CardContent>
      </Card>

      <CreateDeliveryCityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Deactivate city"
        description={`Deactivate "${deleteTarget?.name}"? It will no longer appear in the order form.`}
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={async () => {
          await handleDelete()
        }}
      />
    </div>
  )
}
