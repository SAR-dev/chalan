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
import { CreateZonePricingDialog } from "@/features/platform-config/dialogs/create-zone-pricing-dialog"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZonePricing } from "@/features/platform-config/hooks/use-zone-pricing"
import type { ZonePricing } from "@/lib/types"

export function ZonePricingPageClient() {
  const { zones } = useDeliveryZones()
  const { pricing, isLoading, deletePricing } = useZonePricing()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ZonePricing | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function zoneName(id: string) {
    return zones.find((z) => z.id === id)?.name ?? id
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const result = await deletePricing(deleteTarget.id)
    setDeleteOpen(false)
    setDeleteTarget(null)
    if (!result.ok) return toast.error(result.error)
    toast.success("Pricing deleted.")
  }

  const columns: DataTableColumn<ZonePricing>[] = [
    {
      id: "fromZone",
      header: "From Zone",
      cell: (o) => (
        <CellContent className="font-medium">
          {zoneName(o.fromZoneId)}
        </CellContent>
      ),
    },
    {
      id: "toZone",
      header: "To Zone",
      cell: (o) => (
        <CellContent className="font-medium">
          {zoneName(o.toZoneId)}
        </CellContent>
      ),
    },
    {
      id: "baseRate",
      header: "Base Rate",
      cell: (o) => <CellContent>{o.baseRate}</CellContent>,
    },
    {
      id: "extraRatePerKg",
      header: "Extra/KG",
      cell: (o) => <CellContent>{o.extraRatePerKg}</CellContent>,
    },
    {
      id: "freeWeightKg",
      header: "Free Weight",
      cell: (o) => <CellContent>{o.freeWeightKg}</CellContent>,
    },
    {
      id: "maxWeightKg",
      header: "Max Weight",
      cell: (o) => <CellContent>{o.maxWeightKg}</CellContent>,
    },
    {
      id: "codFeePercentage",
      header: "COD Fee %",
      cell: (o) => <CellContent>{o.codFeePercentage}</CellContent>,
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
                variant="destructive"
                onSelect={() => {
                  setDeleteTarget(o)
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
        title="Zone Pricing"
        description="Define delivery pricing between zone pairs."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Add Pricing
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["fromZone"]}
            id="zone-pricing"
            columns={columns}
            data={pricing}
            getRowKey={(o) => o.id}
            loading={isLoading}
            emptyMessage="No zone pricing yet. Add one to get started."
          />
        </CardContent>
      </Card>

      <CreateZonePricingDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete pricing"
        description="Delete this zone pricing rule? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          await handleDelete()
        }}
      />
    </div>
  )
}
