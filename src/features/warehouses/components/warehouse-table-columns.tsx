import { Warehouse as WarehouseIcon } from "lucide-react"
import { CellTwoRow, type DataTableColumn } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"

export interface WarehouseRow {
  id: string
  name: string
  address: string
  city: string
  isActive: boolean
}

export function warehouseNameColumn(): DataTableColumn<WarehouseRow> {
  return {
    id: "name",
    header: "Warehouse",
    sortable: true,
    sortValue: (w) => w.name,
    cell: (w) => <CellTwoRow primary={w.name} secondary={w.address} />,
  }
}

export function warehouseNameWithIconColumn(): DataTableColumn<WarehouseRow> {
  return {
    id: "name",
    header: "Warehouse",
    sortable: true,
    sortValue: (w) => w.name,
    cell: (w) => (
      <div className="flex items-center gap-2 font-medium">
        <WarehouseIcon className="text-muted-foreground size-4" aria-hidden />
        <CellTwoRow primary={w.name} secondary={w.address} />
      </div>
    ),
  }
}

export function warehouseCityColumn(): DataTableColumn<WarehouseRow> {
  return {
    id: "city",
    header: "City",
    sortable: true,
    sortValue: (w) => w.city,
    headClassName: "hidden sm:table-cell",
    cellClassName: "hidden sm:table-cell",
    cell: (w) => <span>{w.city}</span>,
  }
}

export function warehouseStatusColumn(): DataTableColumn<WarehouseRow> {
  return {
    id: "status",
    header: "Status",
    sortable: true,
    sortValue: (w) => (w.isActive ? 1 : 0),
    cell: (w) => (
      <Badge variant={w.isActive ? "default" : "secondary"}>
        {w.isActive ? "Active" : "Disabled"}
      </Badge>
    ),
  }
}
