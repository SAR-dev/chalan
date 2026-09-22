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
import { CreateDeliveryZoneDialog } from "@/features/platform-config/dialogs/create-delivery-zone-dialog"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import type { DeliveryZone } from "@/lib/types"

export function DeliveryZonesPageClient() {
  const { zones, isLoading, updateZone, deleteZone } = useDeliveryZones()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryZone | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleToggleActive(zone: DeliveryZone) {
    const result = await updateZone(zone.id, { isActive: !zone.isActive })
    if (!result.ok) return toast.error(result.error)
    toast.success(
      `${zone.name} ${zone.isActive ? "deactivated" : "activated"}.`,
    )
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const result = await deleteZone(deleteTarget.id)
    setDeleteOpen(false)
    setDeleteTarget(null)
    if (!result.ok) return toast.error(result.error)
    toast.success(`${deleteTarget.name} deleted.`)
  }

  const columns: DataTableColumn<DeliveryZone>[] = [
    {
      id: "name",
      header: "Zone name",
      cell: (o) => <CellContent className="font-medium">{o.name}</CellContent>,
    },
    {
      id: "status",
      header: "Status",
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
        title="Delivery Zones"
        description="Manage zones that group cities sharing the same delivery pricing."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Add Zone
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="delivery-zones"
            columns={columns}
            data={zones}
            getRowKey={(o) => o.id}
            loading={isLoading}
            emptyMessage="No delivery zones yet. Add one to get started."
          />
        </CardContent>
      </Card>

      <CreateDeliveryZoneDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete zone"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          await handleDelete()
        }}
      />
    </div>
  )
}
