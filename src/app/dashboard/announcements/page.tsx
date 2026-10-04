"use client"

import {
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { FormDialog } from "@/components/form-dialog"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementStatusBadge } from "@/features/announcements/components/announcement-status-badge"
import { useAnnouncements } from "@/features/announcements/hooks/use-announcements"
import { ANNOUNCEMENT_TARGET_ROLE_LABELS } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import type { Announcement } from "@/lib/types"

type TabFilter = "ALL" | "ACTIVE" | "INACTIVE"

export default function AnnouncementsPage() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const {
    announcements,
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
    updateAnnouncement,
    deleteAnnouncement,
    deleteAnnouncements,
    isLoading,
    isRefreshing,
    isActive: _isActive,
    setIsActive,
    mutate: refresh,
  } = useAnnouncements()

  const [tab, setTab] = useState<TabFilter>("ALL")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([])

  const tabActiveMap: Record<TabFilter, boolean | undefined> = {
    ALL: undefined,
    ACTIVE: true,
    INACTIVE: false,
  }

  function handleTabChange(value: string) {
    const v = value as TabFilter
    setTab(v)
    setIsActive(tabActiveMap[v])
    setPage(1)
  }

  async function handleBulkDelete(ids: string[]) {
    setBulkDeleteIds(ids)
    setBulkDeleteOpen(true)
  }

  async function confirmBulkDelete() {
    setBulkBusy(true)
    const res = await deleteAnnouncements(bulkDeleteIds)
    if (res.ok) {
      toast.success(
        `${bulkDeleteIds.length} announcement${bulkDeleteIds.length === 1 ? "" : "s"} deleted.`,
      )
    } else {
      toast.error(res.error ?? "Could not delete announcements.")
    }
    setBulkBusy(false)
    setBulkDeleteOpen(false)
    setBulkDeleteIds([])
  }

  const canManage = currentUser?.role === "SUPER_ADMIN"

  async function handleToggleActive(a: Announcement) {
    setTogglingId(a.id)
    const res = await updateAnnouncement(a.id, { isActive: !a.isActive })
    if (!res.ok) toast.error(res.error ?? "Could not update the announcement.")
    else
      toast.success(`"${a.title}" ${a.isActive ? "deactivated" : "activated"}.`)
    setTogglingId(null)
  }

  async function handleDelete() {
    if (!deleting) return
    setSubmitting(true)
    const res = await deleteAnnouncement(deleting.id)
    setSubmitting(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the announcement.")
      return
    }
    toast.success(`Announcement "${deleting.title}" deleted.`)
    setDeleting(null)
  }

  const columns: DataTableColumn<Announcement>[] = [
    {
      id: "title",
      header: "Title",
      sortable: true,
      sortValue: (a) => a.title,
      cell: (a) => (
        <div className="flex items-center gap-2 font-medium">
          <Megaphone className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{a.title}</span>
        </div>
      ),
    },
    {
      id: "targetRoles",
      header: "Audience",
      sortValue: (a) =>
        (a.targetRoles ?? [])
          .map((role: string) => ANNOUNCEMENT_TARGET_ROLE_LABELS[role] ?? role)
          .join(", "),
      headClassName: "hidden md:table-cell",
      cellClassName: "hidden md:table-cell",
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          {(a.targetRoles ?? []).map((role: string) => (
            <span
              key={role}
              className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs"
            >
              {ANNOUNCEMENT_TARGET_ROLE_LABELS[role] ?? role}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "publishedAt",
      header: "Publishes",
      sortable: true,
      sortValue: (a) => a.publishedAt ?? "",
      headClassName: "hidden lg:table-cell",
      cellClassName: "hidden lg:table-cell",
      cell: (a) => (
        <span className="text-muted-foreground text-sm">
          {a.publishedAt ? formatDateTime(a.publishedAt) : "Draft"}
        </span>
      ),
    },
    {
      id: "expiresAt",
      header: "Expires",
      sortable: true,
      sortValue: (a) => a.expiresAt ?? "",
      headClassName: "hidden lg:table-cell",
      cellClassName: "hidden lg:table-cell",
      cell: (a) => (
        <span className="text-muted-foreground text-sm">
          {a.expiresAt ? formatDateTime(a.expiresAt) : "Never"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (a) => (a.isActive ? 1 : 0),
      cell: (a) => (
        <div className="flex items-center gap-2">
          {canManage && (
            <Switch
              checked={a.isActive}
              disabled={togglingId === a.id}
              onCheckedChange={() => handleToggleActive(a)}
              aria-label={`Toggle active state for ${a.title}`}
            />
          )}
          {togglingId === a.id ? (
            <Loader2 className="text-muted-foreground size-3 animate-spin" />
          ) : (
            <AnnouncementStatusBadge announcement={a} />
          )}
        </div>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (a) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid={`ann-actions-${a.id}`}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              {canManage ? (
                <>
                  <DropdownMenuItem
                    data-testid="ann-edit-item"
                    onClick={() =>
                      router.push(`/dashboard/announcements/${a.id}/edit`)
                    }
                  >
                    <Pencil className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleting(a)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled>No actions</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={pageContent.dashboard.announcements.title}
        description={pageContent.dashboard.announcements.description}
      >
        {canManage && (
          <Button
            data-testid="announcements-new"
            onClick={() => router.push("/dashboard/announcements/new")}
          >
            <Plus className="size-4" />
            New announcement
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["title"]}
            id="dashboard-announcements"
            searchable
            searchColumns={["title"]}
            toolbarLeft={
              <Tabs value={tab} onValueChange={handleTabChange}>
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                  <TabsTrigger value="INACTIVE">Inactive</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={announcements}
            getRowKey={(a) => a.id}
            initialSortId="createdAt"
            emptyMessage="No announcements yet."
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
            bulkLoading={bulkBusy}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            bulkActions={
              canManage
                ? [
                    {
                      label: "Delete",
                      variant: "destructive" as const,
                      icon: <X className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (
                        rows: Announcement[],
                        clear: () => void,
                      ) => {
                        await handleBulkDelete(rows.map((a) => a.id))
                        clear()
                      },
                    },
                  ]
                : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Delete confirm */}
      <FormDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete announcement"
        description={
          deleting
            ? `Permanently delete "${deleting.title}"? This cannot be undone.`
            : ""
        }
        onConfirm={handleDelete}
        submitLabel="Delete"
        submittingLabel="Deleting…"
        submitting={submitting}
        submitVariant="destructive"
      >
        <p className="text-muted-foreground text-sm">
          This will permanently remove the announcement from the platform.
        </p>
      </FormDialog>

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete announcements"
        description={`Permanently delete ${bulkDeleteIds.length} announcement${bulkDeleteIds.length === 1 ? "" : "s"}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={bulkBusy}
        onConfirm={confirmBulkDelete}
      />
    </>
  )
}
