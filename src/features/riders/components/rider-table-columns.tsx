"use client"

import {
  CellContent,
  CellTwoRow,
  type DataTableColumn,
} from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { columnLabels } from "@/config/table-column-labels"
import { taskTypeLabel } from "@/features/riders/dialogs/task-type"
import { riderVehicleLabel } from "@/features/riders/vehicle-label"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Rider } from "@/lib/types"

interface UseRiderColumnsOptions {
  showWarehouse?: boolean
}

export function useRiderColumns({
  showWarehouse = false,
}: UseRiderColumnsOptions = {}): DataTableColumn<Rider>[] {
  const { warehouses } = useWarehouses()

  function warehouseName(id?: string | null) {
    if (!id) return null
    return warehouses.find((w) => w.id === id)?.name ?? "Unknown"
  }

  const columns: DataTableColumn<Rider>[] = [
    {
      id: "name",
      header: columnLabels.rider.name,
      sortable: true,
      sortValue: (r) => r.name,
      cell: (r) => (
        <CellTwoRow
          primary={<span className="font-medium">{r.name}</span>}
          secondary={r.phone}
        />
      ),
    },
    {
      id: "phone",
      header: columnLabels.rider.phone,
      sortable: true,
      sortValue: (r) => r.phone,
      headClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      cell: (r) => (
        <CellContent className="tabular-nums">{r.phone}</CellContent>
      ),
    },
    {
      id: "zone",
      header: columnLabels.rider.zone,
      sortable: true,
      sortValue: (r) => r.zone,
      cell: (r) => <CellContent>{r.zone}</CellContent>,
    },
    {
      id: "taskType",
      header: columnLabels.rider.taskType,
      sortable: true,
      sortValue: (r) => r.taskType,
      cell: (r) => (
        <Badge variant="outline" className="font-normal">
          {taskTypeLabel(r.taskType)}
        </Badge>
      ),
    },
  ]

  if (showWarehouse) {
    columns.push({
      id: "assignment",
      header: columnLabels.rider.warehouse,
      sortable: true,
      sortValue: (r) => warehouseName(r.warehouseId) ?? "",
      cell: (r) => {
        const name = warehouseName(r.warehouseId)
        return name ? (
          <Badge variant="secondary" className="font-normal">
            {name}
          </Badge>
        ) : (
          <CellContent className="text-muted-foreground">—</CellContent>
        )
      },
    })
  }

  columns.push({
    id: "vehicle",
    header: columnLabels.rider.vehicle,
    sortable: true,
    // Sort key is the rendered label so a client-side sort groups the way the
    // column reads. Note this list is server-paginated, so the click actually
    // sorts on `rider.vehicleType` in the API (see api/riders sortColumnMap) —
    // same grouping, ordered by the stored enum rather than the label. The one
    // visible difference is that plate-only riders sort under a null type
    // rather than alphabetically, which is defensible: an unclassified vehicle
    // is the one the admin most wants to see.
    sortValue: (r) => riderVehicleLabel(r) ?? "￿",
    headClassName: "hidden lg:table-cell",
    cellClassName: "hidden lg:table-cell",
    cell: (r) => {
      const vehicle = riderVehicleLabel(r)
      // Wrapped rather than put on `CellContent`, which does not forward
      // arbitrary props — E2E needs to address this column without matching on
      // the label text, which changes with every copy edit.
      if (!vehicle) {
        // Spelled out rather than an em dash: a dash here is indistinguishable
        // from "no vehicle" vs "column too narrow to show", and an admin
        // scanning for who can take a van needs to see the gap.
        return (
          <CellContent className="text-muted-foreground">
            Not recorded
          </CellContent>
        )
      }
      return (
        <span data-testid="rider-vehicle-cell" className="block">
          <CellContent>{vehicle}</CellContent>
        </span>
      )
    },
  })

  columns.push({
    id: "status",
    header: columnLabels.rider.status,
    align: "right",
    sortable: true,
    sortValue: (r) => (r.isActive ? 1 : 0),
    cell: (r) => (
      <Switch
        checked={r.isActive}
        disabled
        className="data-[state=checked]:bg-chart-2 disabled:opacity-100"
        aria-label={r.isActive ? "Active" : "Disabled"}
      />
    ),
  })

  return columns
}
