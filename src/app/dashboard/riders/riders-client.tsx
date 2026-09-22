"use client"

import {
  Bike,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  Pencil,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { QuickFilters } from "@/components/quick-filters"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useRiderColumns } from "@/features/riders/components/rider-table-columns"
import { EditRiderDialog } from "@/features/riders/dialogs/edit-rider-dialog"
import { useRiders } from "@/features/riders/hooks/use-riders"
import type { Rider } from "@/lib/types"

type FilterTab = "ALL" | "ACTIVE" | "INACTIVE"

export function RidersPageClient({
  initialData,
  initialTotal,
  initialCounts,
}: {
  initialData: (Rider & { warehouseName?: string | null })[]
  initialTotal: number
  initialCounts: { active: number }
}) {
  const {
    riders,
    allRiders,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    setIsActive,
    taskType,
    setTaskType,
    sortId,
    sortDir,
    onSortChange,
    isLoading,
  } = useRiders({ initialData, initialTotal })
  const router = useRouter()
  const baseColumns = useRiderColumns({ showWarehouse: true })
  const [editingRider, setEditingRider] = useState<Rider | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [tab, setTab] = useState<FilterTab>("ALL")

  const allColumns: DataTableColumn<Rider>[] = [
    ...baseColumns,
    {
      id: "actions",
      header: "",
      align: "right",
      sticky: true,
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                setEditingRider(row)
                setEditOpen(true)
              }}
            >
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/dashboard/riders/${row.id}`)
              }}
            >
              <Eye className="size-4" />
              View details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  useEffect(() => {
    if (tab === "ACTIVE") setIsActive(true)
    else if (tab === "INACTIVE") setIsActive(false)
    else setIsActive(undefined)
    setPage(1)
  }, [tab, setIsActive, setPage])

  const activeCount =
    allRiders.filter((r) => r.isActive).length || initialCounts.active
  const deliveryCount = allRiders.filter(
    (r) => r.taskType === "DELIVERY" || r.taskType === "BOTH",
  ).length
  const pickupCount = allRiders.filter(
    (r) => r.taskType === "PICKUP" || r.taskType === "BOTH",
  ).length

  const quickFilterSections = [
    {
      label: "Role",
      filters: [
        {
          label: "Pickup",
          value: "PICKUP",
          active: taskType === "PICKUP",
          onToggle: () => {
            setTaskType(taskType === "PICKUP" ? undefined : "PICKUP")
            setPage(1)
          },
        },
        {
          label: "Delivery",
          value: "DELIVERY",
          active: taskType === "DELIVERY",
          onToggle: () => {
            setTaskType(taskType === "DELIVERY" ? undefined : "DELIVERY")
            setPage(1)
          },
        },
        {
          label: "Both",
          value: "BOTH",
          active: taskType === "BOTH",
          onToggle: () => {
            setTaskType(taskType === "BOTH" ? undefined : "BOTH")
            setPage(1)
          },
        },
      ],
    },
  ]

  const activeFilterCount = taskType ? 1 : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.riders.title}
        description={pageContent.dashboard.riders.description}
      />
      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.dashboard.riders.totalRiders.label,
            value: total || allRiders.length,
            icon: Users,
          },
          {
            label: statCardLabels.dashboard.riders.active.label,
            value: activeCount,
            icon: CheckCircle2,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.dashboard.riders.deliveryRiders.label,
            value: deliveryCount,
            icon: WarehouseIcon,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.dashboard.riders.pickupRiders.label,
            value: pickupCount,
            icon: Bike,
            tone: "bg-chart-4/15 text-chart-4",
          },
        ]}
      />
      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            serverPaginated
            id="dashboard-riders"
            searchable
            searchColumns={["name", "zone"]}
            toolbarLeft={
              <div className="flex items-center gap-3">
                <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="ALL">All</TabsTrigger>
                    <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                    <TabsTrigger value="INACTIVE">Inactive</TabsTrigger>
                  </TabsList>
                </Tabs>
                <QuickFilters
                  sections={quickFilterSections}
                  activeCount={activeFilterCount}
                  onClearAll={() => {
                    setTaskType(undefined)
                    setPage(1)
                  }}
                />
              </div>
            }
            columns={allColumns}
            data={riders}
            total={total}
            loading={isLoading}
            query={query}
            onQueryChange={(q) => {
              setQuery(q)
              setPage(1)
            }}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            getRowKey={(r) => r.id}
            initialSortId="name"
            emptyMessage="No riders yet. Add one to get started."
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
          />
        </CardContent>
      </Card>
      <EditRiderDialog
        rider={editingRider}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  )
}
