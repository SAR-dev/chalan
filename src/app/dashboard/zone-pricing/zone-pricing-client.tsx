"use client"

import { LayoutGrid, List, MoreHorizontal, Plus } from "lucide-react"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ZoneRateMatrix } from "@/features/platform-config/components/zone-rate-matrix"
import { CreateZonePricingDialog } from "@/features/platform-config/dialogs/create-zone-pricing-dialog"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZonePricing } from "@/features/platform-config/hooks/use-zone-pricing"
import type { ZonePricing } from "@/lib/types"

/**
 * Which view of the same rates is on screen.
 *
 * List is the default, not the matrix, and that is deliberate: the list is where
 * the row actions live. An admin arriving on this page is most often here to add
 * a rate, edit one, or delete a wrong one, and only the list can do any of that.
 * The matrix answers a different question — "which lanes am I missing?" — which
 * is a coverage audit, not an edit.
 */
type PricingView = "list" | "matrix"

export function ZonePricingPageClient() {
  const { zones } = useDeliveryZones()
  const {
    pricing,
    isLoading,
    isRefreshing,
    deletePricing,
    mutate: refresh,
  } = useZonePricing()
  const [view, setView] = useState<PricingView>("list")
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
      sortValue: (o) => zoneName(o.fromZoneId),
      cell: (o) => (
        <CellContent className="font-medium">
          {zoneName(o.fromZoneId)}
        </CellContent>
      ),
    },
    {
      id: "toZone",
      header: "To Zone",
      sortValue: (o) => zoneName(o.toZoneId),
      cell: (o) => (
        <CellContent className="font-medium">
          {zoneName(o.toZoneId)}
        </CellContent>
      ),
    },
    {
      id: "baseRate",
      header: "Base Rate",
      sortValue: (o) => o.baseRate,
      cell: (o) => <CellContent>{o.baseRate}</CellContent>,
    },
    {
      id: "extraRatePerKg",
      header: "Extra/KG",
      sortValue: (o) => o.extraRatePerKg,
      cell: (o) => <CellContent>{o.extraRatePerKg}</CellContent>,
    },
    {
      id: "freeWeightKg",
      header: "Free Weight",
      sortValue: (o) => o.freeWeightKg,
      cell: (o) => <CellContent>{o.freeWeightKg}</CellContent>,
    },
    {
      id: "maxWeightKg",
      header: "Max Weight",
      sortValue: (o) => o.maxWeightKg,
      cell: (o) => <CellContent>{o.maxWeightKg}</CellContent>,
    },
    {
      id: "codFeePercentage",
      header: "COD Fee %",
      sortValue: (o) => o.codFeePercentage,
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

      {/* Sits above the card, not inside either view. Inside the table toolbar
          it would disappear the moment the matrix was selected, leaving no way
          back; inside the matrix card it would duplicate the list's control. */}
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as PricingView)}
        className="w-fit"
      >
        <TabsList>
          <TabsTrigger value="list" data-testid="zone-pricing-view-list">
            <List className="size-4" />
            List
          </TabsTrigger>
          <TabsTrigger value="matrix" data-testid="zone-pricing-view-matrix">
            <LayoutGrid className="size-4" />
            Matrix
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {view === "list" ? (
            <div data-testid="zone-pricing-list-view">
              <DataTable
                pinnedColumns={["fromZone"]}
                id="zone-pricing"
                columns={columns}
                data={pricing}
                getRowKey={(o) => o.id}
                loading={isLoading || isRefreshing}
                onRefresh={refresh}
                emptyMessage="No zone pricing yet. Add one to get started."
              />
            </div>
          ) : // `pricing` is `[]` until the first fetch resolves, so gating on
          // loading is what stops the matrix from claiming there are no rates
          // configured when in fact they simply have not arrived yet.
          isLoading ? (
            <p
              className="text-muted-foreground px-6 py-10 text-center text-sm"
              data-testid="zone-pricing-matrix-loading"
            >
              Loading rates…
            </p>
          ) : (
            <div className="p-6">
              <ZoneRateMatrix zones={zones} rates={pricing} />
            </div>
          )}
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
