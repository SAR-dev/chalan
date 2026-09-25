"use client"

import { Warehouse as WarehouseIcon } from "lucide-react"
import { useMemo } from "react"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"

interface WarehouseRow {
  id: string
  name: string
  address: string
  city: string
  isActive: boolean
}

export default function WarehouseAdminWarehousesPageClient() {
  useAuth()
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
    mutate: refresh,
  } = useWarehouses()
  const rows = useMemo<WarehouseRow[]>(
    () =>
      warehouses.map((w) => ({
        ...w,
      })),
    [warehouses],
  )

  const columns: DataTableColumn<WarehouseRow>[] = [
    {
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
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.warehouses.title}
        description={pageContent.dashboard.warehouses.description}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="warehouse-admin-warehouses"
            searchable
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
            onRefresh={refresh}
          />
        </CardContent>
      </Card>
    </div>
  )
}
