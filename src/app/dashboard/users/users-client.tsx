"use client"

import { Ban, KeyRound, MoreHorizontal, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  CellContent,
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { RoleBadge } from "@/components/role-badge"
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
import {
  UserStatusBadge,
  userAccountStatus,
} from "@/features/users/components/user-status-badge"
import { BanDialog } from "@/features/users/dialogs/ban-dialog"
import { ResetPasswordDialog } from "@/features/users/dialogs/reset-password-dialog"
import { type AdminUser, useUsers } from "@/features/users/hooks/use-users"
import { USER_STATUS_LABELS } from "@/lib/constants"

const TAB_ROLES = ["ALL", "SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"]

const TAB_LABELS: Record<string, string> = {
  ALL: "All",
  SUPER_ADMIN: "Super admins",
  WAREHOUSE_ADMIN: "Warehouse admins",
  MERCHANT: "Merchants",
  RIDER: "Riders",
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function UsersPageClient({
  initialData,
  initialTotal,
}: {
  initialData: AdminUser[]
  initialTotal: number
}) {
  const {
    users,
    total,
    setPage,
    setLimit,
    query,
    setQuery,
    setRole,
    sortId,
    sortDir,
    onSortChange,
    isLoading,
    isRefreshing,
    currentUserId,
    resetPassword,
    banUser,
    unbanUser,
    mutate: refresh,
  } = useUsers({ initialData, initialTotal })
  const [tab, setTab] = useState("ALL")
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)

  useEffect(() => {
    setRole(tab === "ALL" ? undefined : tab)
    setPage(1)
  }, [tab, setRole, setPage])

  async function handleUnban(target: AdminUser) {
    const result = await unbanUser(target.id)
    if (result.ok) {
      toast.success(`${target.email} unbanned.`)
    } else {
      toast.error(result.error ?? "Failed to unban the user.")
    }
  }

  const columns: DataTableColumn<AdminUser>[] = [
    {
      id: "name",
      header: columnLabels.user.name,
      sortable: true,
      sortValue: (u) => u.name,
      cell: (u) => (
        <CellTwoRow
          primary={<span className="font-medium">{u.name}</span>}
          secondary={u.email}
        />
      ),
    },
    {
      id: "role",
      header: columnLabels.user.role,
      sortable: true,
      sortValue: (u) => u.role ?? "",
      cell: (u) =>
        u.role ? (
          <RoleBadge role={u.role} />
        ) : (
          <CellContent className="text-muted-foreground">—</CellContent>
        ),
    },
    {
      id: "status",
      header: columnLabels.user.status,
      sortValue: (u) => USER_STATUS_LABELS[userAccountStatus(u)],
      cell: (u) => <UserStatusBadge user={u} />,
    },
    {
      id: "createdAt",
      header: columnLabels.user.created,
      sortable: true,
      sortValue: (u) => u.createdAt,
      cell: (u) => (
        <CellContent className="tabular-nums">
          {formatDate(u.createdAt)}
        </CellContent>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (u) => (
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" data-testid="users-actions">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                data-testid="users-reset-open"
                onClick={() => setResetTarget(u)}
              >
                <KeyRound className="size-4" />
                Reset password
              </DropdownMenuItem>
              {u.banned ? (
                <DropdownMenuItem
                  data-testid="users-unban"
                  disabled={u.id === currentUserId}
                  onClick={() => handleUnban(u)}
                >
                  <ShieldCheck className="size-4" />
                  Unban
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  data-testid="users-ban-open"
                  disabled={u.id === currentUserId}
                  onClick={() => setBanTarget(u)}
                >
                  <Ban className="size-4" />
                  Ban
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.users.title}
        description={pageContent.dashboard.users.description}
      />

      <Card data-testid="users-table">
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="users"
            searchable
            searchColumns={["name"]}
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v)}>
                <TabsList>
                  {TAB_ROLES.map((value) => (
                    <TabsTrigger key={value} value={value}>
                      {TAB_LABELS[value]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={users}
            getRowKey={(u) => u.id}
            emptyMessage="No users match the current filters."
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
        </CardContent>
      </Card>

      <ResetPasswordDialog
        user={resetTarget}
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        onSubmit={async (password) => {
          if (!resetTarget) return { ok: false, error: "No user selected." }
          return resetPassword(resetTarget.id, password)
        }}
      />

      <BanDialog
        user={banTarget}
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null)
        }}
        onSubmit={async (input) => {
          if (!banTarget) return { ok: false, error: "No user selected." }
          return banUser(banTarget.id, input)
        }}
      />
    </div>
  )
}
