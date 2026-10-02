"use client"

import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RoleBadge } from "@/components/role-badge"
import { Card, CardContent } from "@/components/ui/card"
import { pageContent } from "@/config/content"
import { AuditDiffCell } from "@/features/audit-logs/components/audit-diff"
import { useAuditLogs } from "@/features/audit-logs/hooks/use-audit-logs"
import { formatDateTime } from "@/lib/format"
import type { AuditLog } from "@/lib/types"

function formatTimestamp(value: string) {
  return formatDateTime(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AuditLogsClient({
  initialData,
  initialTotal,
}: {
  initialData: AuditLog[]
  initialTotal: number
}) {
  const {
    auditLogs,
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
    isRefreshing,
    mutate: refresh,
  } = useAuditLogs({ initialData, initialTotal })

  const columns: DataTableColumn<AuditLog>[] = [
    {
      id: "createdAt",
      header: "When",
      sortable: true,
      sortValue: (l) => l.createdAt,
      cell: (l) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatTimestamp(l.createdAt)}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      sortable: true,
      sortValue: (l) => l.actorName,
      cell: (l) => <span className="font-medium">{l.actorName}</span>,
    },
    {
      id: "actorRole",
      header: "Role",
      sortable: true,
      sortValue: (l) => l.actorRole,
      cell: (l) => <RoleBadge role={l.actorRole} />,
    },
    {
      id: "action",
      header: "Action",
      sortable: true,
      sortValue: (l) => l.action,
      cell: (l) => (
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
          {l.action}
        </code>
      ),
    },
    {
      id: "entity",
      header: "Entity",
      sortable: true,
      sortValue: (l) => l.entityType,
      headClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      cell: (l) => (
        <span className="text-muted-foreground text-sm">{l.entityType}</span>
      ),
    },
    {
      id: "description",
      header: "Description",
      sortValue: (l) => l.description,
      cell: (l) => <span className="text-sm">{l.description}</span>,
    },
    {
      id: "changes",
      header: "Changes",
      cell: (l) => <AuditDiffCell metadata={l.metadata} />,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.auditLogs.title}
        description={pageContent.dashboard.auditLogs.description}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["createdAt"]}
            serverPaginated
            id="dashboard-audit-logs"
            searchable
            columns={columns}
            data={auditLogs}
            total={total}
            loading={isLoading || isRefreshing}
            query={query}
            onQueryChange={(q) => {
              setQuery(q)
              setPage(1)
            }}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
            getRowKey={(l) => l.id}
            initialSortId="createdAt"
            initialSortDir="desc"
            emptyMessage={isLoading ? "Loading…" : "No audit log entries yet."}
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
