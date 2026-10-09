"use client"

import { Bike, CheckCircle2, Clock, Eye, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { columnLabels } from "@/config/table-column-labels"
import { RiderApplicationDetailDialog } from "@/features/riders/dialogs/rider-application-detail-dialog"
import type { RiderApplication } from "@/features/riders/hooks/use-rider-applications"
import { useRiderApplications } from "@/features/riders/hooks/use-rider-applications"
import { RIDER_STATUS_LABELS, RIDER_STATUS_TONES } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { toast } from "@/lib/notify"
import type { RiderStatus } from "@/lib/types"

type FilterTab = "ALL" | RiderStatus

const TAB_STATUSES: Record<FilterTab, string[] | undefined> = {
  ALL: undefined,
  PENDING: ["PENDING"],
  APPROVED: ["APPROVED"],
  ACTIVE: ["ACTIVE"],
  REJECTED: ["REJECTED"],
  SUSPENDED: ["SUSPENDED"],
}

export function RiderApplicationsPageClient({
  initialData,
  initialTotal,
  initialCounts,
}: {
  initialData: RiderApplication[]
  initialTotal: number
  initialCounts: { pending: number; active: number; rejected: number }
}) {
  const {
    applications,
    allApplications,
    total,
    page: _page,
    setPage,
    isLoading,
    isRefreshing,
    mutate,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    setStatuses,
    sortId,
    sortDir,
    onSortChange,
  } = useRiderApplications({ initialData, initialTotal })

  const [tab, setTab] = useState<FilterTab>("PENDING")

  const [detailApp, setDetailApp] = useState<RiderApplication | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  // The all-list is query-aware, so a zero is a real answer once a search runs
  // — falling back to the unfiltered aggregate would show a total for rows the
  // table is not displaying.
  const counts = useMemo(() => {
    if (query) {
      return {
        total: allApplications.length,
        pending: allApplications.filter((a) => a.status === "PENDING").length,
        approved: allApplications.filter((a) => a.status === "APPROVED").length,
        active: allApplications.filter((a) => a.status === "ACTIVE").length,
        rejected: allApplications.filter((a) => a.status === "REJECTED").length,
      }
    }
    return {
      total: allApplications.length || initialTotal,
      pending:
        allApplications.filter((a) => a.status === "PENDING").length ||
        initialCounts.pending,
      approved: allApplications.filter((a) => a.status === "APPROVED").length,
      active:
        allApplications.filter((a) => a.status === "ACTIVE").length ||
        initialCounts.active,
      rejected:
        allApplications.filter((a) => a.status === "REJECTED").length ||
        initialCounts.rejected,
    }
  }, [allApplications, initialTotal, initialCounts, query])

  function openDetail(app: RiderApplication) {
    setDetailApp(app)
    setDetailOpen(true)
  }

  async function handleApproved() {
    toast.success(`${detailApp?.name} approved.`)
    setDetailApp(null)
    mutate()
  }

  async function handleRejected() {
    toast.success(`${detailApp?.name} rejected.`)
    setDetailApp(null)
    mutate()
  }

  const columns: DataTableColumn<RiderApplication>[] = [
    {
      id: "name",
      header: columnLabels.rider.name,
      sortable: true,
      sortValue: (a) => a.name,
      cell: (a) => (
        <CellTwoRow
          primary={<span className="font-medium">{a.name}</span>}
          secondary={a.email}
        />
      ),
    },
    {
      id: "phone",
      header: columnLabels.rider.phone,
      sortValue: (a) => a.phone,
      cell: (a) => a.phone,
    },
    {
      id: "zone",
      header: columnLabels.rider.zone,
      sortable: true,
      sortValue: (a) => a.zone,
      cell: (a) => a.zone,
    },
    {
      id: "warehouse",
      header: columnLabels.rider.warehouse,
      sortValue: (a) => a.warehouseName ?? "—",
      cell: (a) => a.warehouseName ?? "—",
    },
    {
      id: "status",
      header: columnLabels.rider.status,
      sortable: true,
      sortValue: (a) => a.status,
      cell: (a) => (
        <StatusBadge
          label={RIDER_STATUS_LABELS[a.status]}
          tone={RIDER_STATUS_TONES[a.status]}
        />
      ),
    },
    {
      id: "createdAt",
      header: "Applied",
      sortable: true,
      sortValue: (a) => a.createdAt,
      cell: (a) => (
        <span className="text-muted-foreground text-sm">
          {formatDateTime(a.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (a) => (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            onClick={() => openDetail(a)}
            // Scoped by id: the approval test opens one specific application,
            // and a bare "View" would be ambiguous on any list with a second
            // pending rider in it.
            data-testid={`rider-app-view-${a.id}`}
          >
            <Eye className="size-4" />
            View
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.riderApplications.title}
        description={pageContent.dashboard.riderApplications.description}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label:
              statCardLabels.dashboard.riderApplications.totalApplications
                .label,
            value: counts.total,
            icon: Bike,
          },
          {
            label: statCardLabels.dashboard.riderApplications.pending.label,
            value: counts.pending,
            icon: Clock,
            tone: "bg-chart-3/15 text-chart-3",
          },
          {
            label: statCardLabels.dashboard.riderApplications.active.label,
            value: counts.active,
            icon: CheckCircle2,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.dashboard.riderApplications.rejected.label,
            value: counts.rejected,
            icon: XCircle,
            tone: "bg-destructive/10 text-destructive",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="dashboard-rider-applications"
            searchable
            searchColumns={["name", "phone", "zone"]}
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="PENDING">Pending</TabsTrigger>
                  <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                  <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={applications}
            getRowKey={(a) => a.id}
            initialSortId="createdAt"
            emptyMessage="No applications match the current filters."
            loading={isLoading || isRefreshing}
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
            onRefresh={mutate}
          />
        </CardContent>
      </Card>

      <RiderApplicationDetailDialog
        application={detailApp}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onApproved={handleApproved}
        onRejected={handleRejected}
      />
    </div>
  )
}
