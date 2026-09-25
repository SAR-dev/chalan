"use client"

import { Bike, CheckCircle2, Truck, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { QuickFilters } from "@/components/quick-filters"
import { StatCardList } from "@/components/stat-card-list"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useRiderColumns } from "@/features/riders/components/rider-table-columns"
import { EditRiderDialog } from "@/features/riders/dialogs/edit-rider-dialog"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Rider } from "@/lib/types"

type FilterTab = "ALL" | "ACTIVE" | "INACTIVE"

export function WarehouseRidersPageClient({
  initialData,
  initialTotal,
  initialCounts,
}: {
  initialData: Rider[]
  initialTotal: number
  initialCounts: { active: number; delivery: number; pickup: number }
}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const {
    riders,
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
    mutate: refresh,
  } = useRiders({ initialData, initialTotal })
  const columns = useRiderColumns()
  const [editingRider, setEditingRider] = useState<Rider | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [tab, setTab] = useState<FilterTab>("ALL")

  function handleRowClick(rider: Rider) {
    setEditingRider(rider)
    setEditOpen(true)
  }

  useEffect(() => {
    if (tab === "ACTIVE") setIsActive(true)
    else if (tab === "INACTIVE") setIsActive(false)
    else setIsActive(undefined)
    setPage(1)
  }, [tab, setIsActive, setPage])

  const activeCount = initialCounts.active
  const deliveryCount = initialCounts.delivery
  const pickupCount = initialCounts.pickup

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
        title={pageContent.warehouse.riders.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.riders.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.warehouse.riders.totalRiders.label,
            value: riders.length,
            icon: Users,
          },
          {
            label: statCardLabels.warehouse.riders.active.label,
            value: activeCount,
            icon: CheckCircle2,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.warehouse.riders.deliveryRiders.label,
            value: deliveryCount,
            icon: Truck,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.warehouse.riders.pickupRiders.label,
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
            id="warehouse-riders"
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
            columns={columns}
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
            emptyMessage="No riders are based at this warehouse yet."
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
            onRefresh={refresh}
            onRowClick={handleRowClick}
          />
        </CardContent>
      </Card>

      <EditRiderDialog
        rider={editingRider}
        open={editOpen}
        onOpenChange={setEditOpen}
        canReassignWarehouse={false}
      />
    </div>
  )
}
