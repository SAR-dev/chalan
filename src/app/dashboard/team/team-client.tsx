"use client"

import { Loader2, Warehouse } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { ChangeWarehouseDialog } from "@/features/team/dialogs/change-warehouse-dialog"
import { CreateAccountDialog } from "@/features/team/dialogs/create-account-dialog"
import { useTeam } from "@/features/team/hooks/use-team"
import type { TeamMember } from "@/lib/types"

const UNASSIGNED = "__unassigned__"

function StatusToggle({
  user,
  onToggle,
  loading,
  isSelf,
}: {
  user: TeamMember
  onToggle: () => void
  loading?: boolean
  isSelf?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={user.isActive}
        disabled={loading || isSelf}
        onCheckedChange={onToggle}
        aria-label={`Toggle active state for ${user.name}`}
      />
      {loading ? (
        <Loader2 className="text-muted-foreground size-3 animate-spin" />
      ) : (
        <span className="text-muted-foreground">
          {user.isActive ? "Active" : "Disabled"}
        </span>
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary">
      {role === "SUPER_ADMIN" ? "Super Admin" : "Warehouse Admin"}
    </Badge>
  )
}

export function TeamPageClient({
  initialData,
  initialTotal,
  initialWarehouses,
}: {
  initialData: TeamMember[]
  initialTotal: number
  initialWarehouses: { id: string; name: string; city: string }[]
}) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const {
    team,
    total,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    query,
    toggleAccountActive,
    updateAccountWarehouse,
    isLoading,
    mutate: refresh,
  } = useTeam({ initialData, initialTotal })
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false)
  const [warehouseUser, setWarehouseUser] = useState<TeamMember | null>(null)
  const [selectedWarehouseId, setSelectedWarehouseId] =
    useState<string>(UNASSIGNED)
  const [warehouseSaving, setWarehouseSaving] = useState(false)

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"
  useEffect(() => {
    if (currentUser && !isSuperAdmin) {
      router.replace("/dashboard")
    }
  }, [currentUser, isSuperAdmin, router])

  function warehouseName(id?: string | null) {
    if (!id) return "Unassigned"
    return initialWarehouses.find((w) => w.id === id)?.name ?? "Unknown"
  }

  async function handleToggleActive(user: TeamMember) {
    setTogglingId(user.id)
    await toggleAccountActive(user.id)
    toast.success(`${user.name} ${user.isActive ? "disabled" : "enabled"}.`)
    setTogglingId(null)
  }

  function openWarehouseDialog(user: TeamMember) {
    setWarehouseUser(user)
    setSelectedWarehouseId(user.warehouseId ?? UNASSIGNED)
    setWarehouseDialogOpen(true)
  }

  async function handleChangeWarehouse() {
    if (!warehouseUser) return
    const warehouseId =
      selectedWarehouseId === UNASSIGNED ? null : selectedWarehouseId
    if ((warehouseUser.warehouseId ?? null) === warehouseId) {
      setWarehouseDialogOpen(false)
      return
    }
    setWarehouseSaving(true)
    await updateAccountWarehouse(warehouseUser.id, warehouseId)
    toast.success(
      warehouseId
        ? `${warehouseUser.name} now manages ${warehouseName(warehouseId)}.`
        : `${warehouseUser.name} is no longer assigned to a warehouse.`,
    )
    setWarehouseSaving(false)
    setWarehouseDialogOpen(false)
  }

  const columns: DataTableColumn<TeamMember>[] = [
    {
      id: "name",
      header: "Name",
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
      header: "Role",
      sortValue: (u) =>
        u.role === "SUPER_ADMIN" ? "Super Admin" : "Warehouse Admin",
      cell: (u) => <RoleBadge role={u.role} />,
    },
    {
      id: "contact",
      header: "Contact",
      sortValue: (u) => u.email,
      headClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      cell: (u) => <CellTwoRow primary={u.email} secondary={u.phone} />,
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (u) =>
        u.role !== "WAREHOUSE_ADMIN" ? "-" : warehouseName(u.warehouseId),
      cell: (u) => {
        if (u.role !== "WAREHOUSE_ADMIN")
          return <span className="text-muted-foreground">-</span>
        return (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => openWarehouseDialog(u)}
          >
            <Warehouse className="size-3" />
            {warehouseName(u.warehouseId)}
          </Button>
        )
      },
    },
    {
      id: "status",
      header: "Status",
      align: "right",
      sortValue: (u) => (u.isActive ? "Active" : "Disabled"),
      cell: (u) => (
        <div className="flex justify-end">
          <StatusToggle
            user={u}
            onToggle={() => handleToggleActive(u)}
            loading={togglingId === u.id}
            isSelf={u.id === currentUser?.id}
          />
        </div>
      ),
    },
  ]

  if (!isSuperAdmin) return null

  return (
    <>
      <PageHeader
        title={pageContent.dashboard.team.title}
        description={pageContent.dashboard.team.description}
      >
        <CreateAccountDialog />
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="dashboard-team"
            columns={columns}
            data={team}
            getRowKey={(u) => u.id}
            initialSortId="role"
            emptyMessage="No team members yet."
            loading={isLoading}
            serverPaginated
            total={total}
            query={query}
            onRefresh={refresh}
            onPageChange={(p, l) => {
              setPage(p)
              setLimit(l)
            }}
          />
        </CardContent>
      </Card>

      <ChangeWarehouseDialog
        open={warehouseDialogOpen}
        onOpenChange={setWarehouseDialogOpen}
        user={warehouseUser}
        warehouses={initialWarehouses}
        selectedWarehouseId={selectedWarehouseId}
        onWarehouseChange={setSelectedWarehouseId}
        onConfirm={handleChangeWarehouse}
        loading={warehouseSaving}
      />
    </>
  )
}
