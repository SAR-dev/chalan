"use client"

import {
  CheckCheck,
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  Send,
} from "lucide-react"
import { useState } from "react"
import {
  CellContent,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
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
import { columnLabels } from "@/config/table-column-labels"
import { EmailLogDetailDialog } from "@/features/email-logs/dialogs/email-log-detail-dialog"
import {
  fetchEmailLog,
  useEmailLogs,
} from "@/features/email-logs/hooks/use-email-logs"
import {
  EMAIL_LOG_STATUS_LABELS,
  EMAIL_LOG_STATUS_TONES,
} from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { toast } from "@/lib/notify"
import type { EmailLogListItem } from "@/lib/types"

type TabFilter = "ALL" | "SENT" | "FAILED"

function formatTimestamp(value: string) {
  return formatDateTime(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function EmailLogsPage() {
  const {
    emailLogs,
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
    markAsSent,
    markAsSentBulk,
    statusFilter: _statusFilter,
    setStatusFilter,
    mutate: refresh,
  } = useEmailLogs()
  const [tab, setTab] = useState<TabFilter>("ALL")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<EmailLogListItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  async function handleBulkMarkAsSent(ids: string[]) {
    setBulkBusy(true)
    const res = await markAsSentBulk(ids)
    if (res.ok) {
      toast.success(
        `${ids.length} email${ids.length === 1 ? "" : "s"} marked as sent.`,
      )
    } else {
      toast.error(res.error ?? "Could not mark emails as sent.")
    }
    setBulkBusy(false)
  }

  async function openDetail(log: EmailLogListItem) {
    setSelectedLog(log)
    setDetailOpen(true)
  }

  async function handleMarkAsSent(log: EmailLogListItem) {
    setBusy(log.id)
    try {
      const result = await markAsSent(log.id)
      if (result.ok) {
        toast.success(`Marked email to ${log.to} as sent.`)
      } else {
        toast.error(result.error ?? "Unable to mark this email as sent.")
      }
    } finally {
      setBusy(null)
    }
  }

  // The list rows omit the plain-text body, so the mailto link can only be
  // built after fetching the record.
  async function handleSendManually(log: EmailLogListItem) {
    setBusy(log.id)
    try {
      const detail = await fetchEmailLog(log.id)
      const body = detail?.textBody
        ? `&body=${encodeURIComponent(detail.textBody)}`
        : ""
      window.location.href = `mailto:${log.to}?subject=${encodeURIComponent(log.subject)}${body}`
    } finally {
      setBusy(null)
    }
  }

  const columns: DataTableColumn<EmailLogListItem>[] = [
    {
      id: "details",
      header: "",
      headClassName: "w-8",
      cell: (l) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(l)}>
          <Eye className="size-3.5" />
        </Button>
      ),
    },
    {
      id: "createdAt",
      header: columnLabels.emailLog.when,
      sortable: true,
      sortValue: (l) => l.createdAt,
      cell: (l) => (
        <CellContent className="text-muted-foreground whitespace-nowrap">
          {formatTimestamp(l.createdAt)}
        </CellContent>
      ),
    },
    {
      id: "to",
      header: columnLabels.emailLog.to,
      sortable: true,
      sortValue: (l) => l.to,
      cell: (l) => <CellContent>{l.to}</CellContent>,
    },
    {
      id: "subject",
      header: columnLabels.emailLog.subject,
      sortable: true,
      sortValue: (l) => l.subject,
      cell: (l) => <CellContent>{l.subject}</CellContent>,
    },
    {
      id: "status",
      header: columnLabels.emailLog.status,
      sortable: true,
      sortValue: (l) => l.status,
      cell: (l) => (
        <StatusBadge
          label={EMAIL_LOG_STATUS_LABELS[l.status]}
          tone={EMAIL_LOG_STATUS_TONES[l.status]}
        />
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (l) => {
        const isFailed = l.status === "FAILED"
        return (
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
                {isFailed ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => handleMarkAsSent(l)}
                      disabled={busy === l.id}
                    >
                      {busy === l.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCheck className="size-4" />
                      )}
                      Mark as sent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSendManually(l)}
                      disabled={busy === l.id}
                    >
                      {busy === l.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Mail className="size-3.5" />
                      )}
                      Send manually
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.emailLogs.title}
        description={pageContent.dashboard.emailLogs.description}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["createdAt"]}
            serverPaginated
            id="dashboard-email-logs"
            searchable
            searchColumns={["subject", "to"]}
            toolbarLeft={
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  const val = v as TabFilter
                  setTab(val)
                  setStatusFilter(val === "ALL" ? undefined : val)
                  setPage(1)
                }}
              >
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="SENT">Sent</TabsTrigger>
                  <TabsTrigger value="FAILED">Failed</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={emailLogs}
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
            // Skeletons cover the first load, so only the empty-result branch
            // Is ever rendered here.
            emptyMessage="No email log entries yet."
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
            onRefresh={refresh}
            bulkLoading={bulkBusy}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            bulkActions={[
              {
                label: "Mark as sent",
                icon: <Send className="size-4" />,
                disabled: bulkBusy,
                onClick: async (
                  rows: EmailLogListItem[],
                  clear: () => void,
                ) => {
                  await handleBulkMarkAsSent(
                    rows.filter((l) => l.status === "FAILED").map((l) => l.id),
                  )
                  clear()
                },
              },
            ]}
          />
        </CardContent>
      </Card>

      <EmailLogDetailDialog
        log={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
