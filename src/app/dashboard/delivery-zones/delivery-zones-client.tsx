"use client"

import { MoreHorizontal, Pencil, Plus, ShieldCheck } from "lucide-react"
import { useMemo, useState } from "react"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreateDeliveryZoneDialog } from "@/features/platform-config/dialogs/create-delivery-zone-dialog"
import { EditDeliveryZoneDialog } from "@/features/platform-config/dialogs/edit-delivery-zone-dialog"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import type { DeliveryZone } from "@/lib/types"

export function DeliveryZonesPageClient() {
  const {
    zones,
    isLoading,
    isRefreshing,
    updateZone,
    deleteZone,
    mutate: refresh,
  } = useDeliveryZones()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<DeliveryZone | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryZone | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Client-side status filter. The hook loads every zone (active and inactive),
  // so the tab narrows the already-loaded list; "All" keeps the old behaviour
  // of showing everything, which is what an admin expects when landing here.
  const [statusTab, setStatusTab] = useState<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL",
  )

  const filteredZones = useMemo(
    () =>
      statusTab === "ALL"
        ? zones
        : zones.filter((z) =>
            statusTab === "ACTIVE" ? z.isActive : !z.isActive,
          ),
    [zones, statusTab],
  )

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
      sortValue: (o) => o.name,
      cell: (o) => <CellContent className="font-medium">{o.name}</CellContent>,
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
              <DropdownMenuItem
                data-testid={`delivery-zone-edit-${o.id}`}
                onSelect={() => setEditing(o)}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
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
            searchable
            searchColumns={["name"]}
            toolbarLeft={
              <Tabs
                value={statusTab}
                onValueChange={(v) =>
                  setStatusTab(v as "ALL" | "ACTIVE" | "INACTIVE")
                }
              >
                <TabsList>
                  <TabsTrigger value="ALL" data-testid="delivery-zones-tab-ALL">
                    All
                  </TabsTrigger>
                  <TabsTrigger
                    value="ACTIVE"
                    data-testid="delivery-zones-tab-ACTIVE"
                  >
                    Active
                  </TabsTrigger>
                  <TabsTrigger
                    value="INACTIVE"
                    data-testid="delivery-zones-tab-INACTIVE"
                  >
                    Inactive
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={filteredZones}
            getRowKey={(o) => o.id}
            loading={isLoading || isRefreshing}
            onRefresh={refresh}
            emptyMessage="No delivery zones yet. Add one to get started."
          />
        </CardContent>
      </Card>

      <CreateDeliveryZoneDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <EditDeliveryZoneDialog
        zone={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
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
