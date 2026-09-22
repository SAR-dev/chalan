"use client"

import { MoreHorizontal, Pencil } from "lucide-react"
import { useMemo, useState } from "react"
import {
  CellTwoRow,
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
import { pageContent } from "@/config/content"
import { CreateWarehouseDialog } from "@/features/warehouses/dialogs/create-warehouse-dialog"
import { EditWarehouseDialog } from "@/features/warehouses/dialogs/edit-warehouse-dialog"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Warehouse } from "@/lib/types"

interface WarehouseRow {
  id: string
  name: string
  address: string
  city: string
  isActive: boolean
}

export function WarehousesPageClient({
  initialData,
  initialTotal,
}: {
  initialData: Warehouse[]
  initialTotal: number
}) {
  const {
    warehouses,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    sortId,
    sortDir,
    onSortChange,
    isLoading,
  } = useWarehouses({ initialData, initialTotal })
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const rows = useMemo<WarehouseRow[]>(
    () => warehouses.map((w) => ({ ...w })),
    [warehouses],
  )

  const columns: DataTableColumn<WarehouseRow>[] = [
    {
      id: "name",
      header: "Warehouse",
      sortable: true,
      sortValue: (w) => w.name,
      cell: (w) => <CellTwoRow primary={w.name} secondary={w.address} />,
    },
    {
      id: "city",
      header: "City",
      sortable: true,
      sortValue: (w) => w.city,
      headClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      cell: (w) => <span>{w.city}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (w) => (w.isActive ? 1 : 0),
      cell: (w) => (
        <Badge variant={w.isActive ? "default" : "secondary"}>
          {w.isActive ? "Active" : "Disabled"}
        </Badge>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      cell: (w) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const full = warehouses.find((x) => x.id === w.id)
                if (full) {
                  setEditing(full)
                  setEditOpen(true)
                }
              }}
            >
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.warehouses.title}
        description={pageContent.dashboard.warehouses.description}
      >
        <CreateWarehouseDialog />
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="dashboard-warehouses"
            columns={columns}
            data={rows}
            getRowKey={(w) => w.id}
            initialSortId="name"
            emptyMessage="No warehouses found."
            loading={isLoading}
            serverPaginated
            total={total}
            query={query}
            onQueryChange={setQuery}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
          />
        </CardContent>
      </Card>

      <EditWarehouseDialog
        warehouse={editing}
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next)
          if (!next) setEditing(null)
        }}
      />
    </div>
  )
}
