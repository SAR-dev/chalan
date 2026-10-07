"use client"

import { MessageSquareReply, MoreHorizontal, X } from "lucide-react"
import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellContent,
  CellTwoRow,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { SupportReference } from "@/features/support/components/support-reference"
import { SupportStatusBadge } from "@/features/support/components/support-status-badge"
import { CreateTicketDialog } from "@/features/support/dialogs/create-ticket-dialog"
import { ReplyTicketDialog } from "@/features/support/dialogs/reply-ticket-dialog"
import { useSupport } from "@/features/support/hooks/use-support"
import { ROLE_LABELS } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { toast } from "@/lib/notify"
import type { SupportTicket } from "@/lib/types"

type FilterTab = "ALL" | "OPEN" | "ANSWERED" | "CLOSED"

const TAB_STATUSES: Record<FilterTab, string[] | undefined> = {
  ALL: undefined,
  OPEN: ["OPEN"],
  ANSWERED: ["ANSWERED"],
  CLOSED: ["CLOSED"],
}

function supportContentFor(role?: string) {
  if (role === "MERCHANT") return pageContent.merchant.support
  if (role === "WAREHOUSE_ADMIN") return pageContent.warehouse.support
  if (role === "RIDER") return pageContent.rider.support
  return pageContent.dashboard.support
}

function formatDate(value: string) {
  return formatDateTime(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function SupportPageClient({
  isAdmin,
  initialData,
  initialTotal,
}: {
  isAdmin: boolean
  initialData?: SupportTicket[]
  initialTotal?: number
}) {
  const { currentUser } = useAuth()
  const {
    tickets,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    statuses: _statuses,
    setStatuses,
    sortId,
    sortDir,
    onSortChange,
    isLoading,
    isRefreshing,
    closeTicket,
    mutate: refresh,
  } = useSupport({ initialData, initialTotal })

  const [tab, setTab] = useState<FilterTab>("ALL")
  const [replyTarget, setReplyTarget] = useState<SupportTicket | null>(null)
  const [closing, setClosing] = useState<SupportTicket | null>(null)
  const [closingBusy, setClosingBusy] = useState(false)

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const content = isAdmin
    ? pageContent.dashboard.support
    : supportContentFor(currentUser?.role)

  const tableId = isAdmin
    ? "support-tickets"
    : `support-tickets-${(currentUser?.role ?? "user").toLowerCase()}`

  async function handleClose() {
    if (!closing) return
    setClosingBusy(true)
    const res = await closeTicket(closing.id)
    setClosingBusy(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not close this ticket.")
      return
    }
    toast.success("Ticket closed.")
    setClosing(null)
  }

  const columns: DataTableColumn<SupportTicket>[] = [
    {
      id: "subject",
      header: columnLabels.support.subject,
      sortable: true,
      sortValue: (t) => t.subject,
      cell: (t) => (
        <span data-testid="support-row" className="block min-w-0">
          <CellContent className="font-medium">{t.subject}</CellContent>
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            id: "requester",
            header: columnLabels.support.requester,
            sortValue: (t: SupportTicket) => t.actorName,
            cell: (t: SupportTicket) => (
              <CellTwoRow
                primary={t.actorName}
                secondary={ROLE_LABELS[t.actorRole] ?? t.actorRole}
              />
            ),
          } satisfies DataTableColumn<SupportTicket>,
        ]
      : []),
    {
      id: "message",
      header: columnLabels.support.message,
      sortValue: (t) => t.message,
      headClassName: "hidden md:table-cell",
      cellClassName: "hidden md:table-cell",
      cell: (t) => <CellContent>{t.message}</CellContent>,
    },
    ...(isAdmin
      ? []
      : [
          {
            id: "reply",
            header: columnLabels.support.reply,
            sortValue: (t: SupportTicket) => t.adminReply ?? "No reply yet",
            headClassName: "hidden lg:table-cell",
            cellClassName: "hidden lg:table-cell",
            cell: (t: SupportTicket) =>
              t.adminReply ? (
                <CellContent title={t.adminReply}>{t.adminReply}</CellContent>
              ) : (
                <span className="text-muted-foreground text-sm">
                  No reply yet
                </span>
              ),
          } satisfies DataTableColumn<SupportTicket>,
        ]),
    {
      id: "status",
      header: columnLabels.support.status,
      sortable: true,
      sortValue: (t) => t.status,
      cell: (t) => (
        <span data-testid="support-status">
          <SupportStatusBadge status={t.status} />
        </span>
      ),
    },
    {
      id: "created",
      header: columnLabels.support.created,
      sortable: true,
      sortValue: (t) => t.createdAt,
      cell: (t) => (
        <span className="text-muted-foreground text-sm">
          {formatDate(t.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (t) => {
        const isClosed = t.status === "CLOSED"
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid="support-row-actions"
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {isAdmin ? (
                  <>
                    <DropdownMenuItem
                      data-testid="support-reply-open"
                      disabled={isClosed}
                      onClick={() => setReplyTarget(t)}
                    >
                      <MessageSquareReply className="size-4" />
                      Reply
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isClosed}
                  onClick={() => setClosing(t)}
                >
                  <X className="size-4" />
                  {isAdmin ? "Close ticket" : "Close my ticket"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const searchColumns = isAdmin
    ? ["subject", "message", "requester"]
    : ["subject", "message", "reply"]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={content.title} description={content.description}>
        {!isAdmin ? <CreateTicketDialog /> : null}
      </PageHeader>

      {/* Merchants get the standing reference the onboarding wizard used to
          deliver; admins/warehouse/riders are working a ticket queue. */}
      {!isAdmin && currentUser?.role === "MERCHANT" ? (
        <SupportReference />
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div data-testid="support-tickets">
            <DataTable
              pinnedColumns={["subject"]}
              id={tableId}
              searchable
              searchColumns={searchColumns}
              toolbarLeft={
                <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="ALL">All</TabsTrigger>
                    <TabsTrigger value="OPEN">Open</TabsTrigger>
                    <TabsTrigger value="ANSWERED">Answered</TabsTrigger>
                    <TabsTrigger value="CLOSED">Closed</TabsTrigger>
                  </TabsList>
                </Tabs>
              }
              columns={columns}
              data={tickets}
              getRowKey={(t) => t.id}
              initialSortId="created"
              initialSortDir="desc"
              emptyMessage={
                tab === "ALL"
                  ? "No support tickets yet."
                  : "No tickets match this filter."
              }
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
              onRefresh={refresh}
            />
          </div>
        </CardContent>
      </Card>

      <ReplyTicketDialog
        ticket={replyTarget}
        onClose={() => setReplyTarget(null)}
      />

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(o) => {
          if (!o) setClosing(null)
        }}
        title="Close support ticket"
        description={`Close "${closing?.subject}"? It won't accept further replies.`}
        confirmLabel="Close ticket"
        variant="destructive"
        loading={closingBusy}
        onConfirm={handleClose}
      />
    </div>
  )
}
