"use client"

import {
  Ban,
  CheckCircle2,
  Coins,
  FileText,
  Mail,
  MailCheck,
  MoreHorizontal,
  PackagePlus,
  Phone,
  RotateCcw,
  Store,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { QuickFilters } from "@/components/quick-filters"
import { StatCardList } from "@/components/stat-card-list"
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
import { statCardLabels } from "@/config/stat-card-labels"
import { columnLabels } from "@/config/table-column-labels"
import { MerchantStatusBadge } from "@/features/merchants/components/merchant-status-badge"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { AssignPackageDialog } from "@/features/packages/dialogs/assign-package-dialog"
import { formatTk } from "@/lib/pricing"
import type { Merchant } from "@/lib/types"

type FilterTab = "ALL" | "ACTIVE" | "SUSPENDED"

const TAB_STATUSES: Record<FilterTab, string[] | undefined> = {
  ALL: undefined,
  ACTIVE: ["ACTIVE"],
  SUSPENDED: ["SUSPENDED"],
}

export function MerchantsPageClient({
  initialData,
  initialTotal,
  initialCounts,
}: {
  initialData: Merchant[]
  initialTotal: number
  initialCounts: { total: number; active: number; suspended: number }
}) {
  const router = useRouter()
  const {
    merchants,
    allMerchants,
    total,
    page: _page,
    setPage,
    isLoading,
    limit: _limit,
    setLimit,
    query,
    setQuery,
    setStatuses,
    emailVerified,
    setEmailVerified,
    nidStatus,
    setNidStatus,
    sortId,
    sortDir,
    onSortChange,
    suspendMerchant,
    suspendMerchants,
    reactivateMerchant,
    reactivateMerchants,
    mutate: refresh,
  } = useMerchants({ initialData, initialTotal })
  const [tab, setTab] = useState<FilterTab>("ALL")
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(
    new Set(),
  )
  const [bulkBusy, setBulkBusy] = useState(false)

  async function handleBulkSuspend(ids: string[]) {
    setBulkSuspendIds(ids)
    setBulkSuspendOpen(true)
  }

  async function confirmBulkSuspend() {
    setBulkBusy(true)
    await suspendMerchants(bulkSuspendIds)
    toast.success(
      `${bulkSuspendIds.length} merchant${bulkSuspendIds.length === 1 ? "" : "s"} suspended.`,
    )
    setBulkBusy(false)
    setBulkSuspendOpen(false)
    setBulkSuspendIds([])
  }

  async function handleBulkReactivate(ids: string[]) {
    setBulkReactivateIds(ids)
    setBulkReactivateOpen(true)
  }

  async function confirmBulkReactivate() {
    setBulkBusy(true)
    await reactivateMerchants(bulkReactivateIds)
    toast.success(
      `${bulkReactivateIds.length} merchant${bulkReactivateIds.length === 1 ? "" : "s"} reactivated.`,
    )
    setBulkBusy(false)
    setBulkReactivateOpen(false)
    setBulkReactivateIds([])
  }

  const [assignTarget, setAssignTarget] = useState<Merchant | null>(null)
  const [confirmMerchant, setConfirmMerchant] = useState<Merchant | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    "suspend" | "reactivate" | null
  >(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false)
  const [bulkSuspendIds, setBulkSuspendIds] = useState<string[]>([])
  const [bulkReactivateOpen, setBulkReactivateOpen] = useState(false)
  const [bulkReactivateIds, setBulkReactivateIds] = useState<string[]>([])

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const counts = useMemo(
    () => ({
      total: allMerchants.length || initialCounts.total,
      active:
        allMerchants.filter((m) => m.status === "ACTIVE").length ||
        initialCounts.active,
      suspended:
        allMerchants.filter((m) => m.status === "SUSPENDED").length ||
        initialCounts.suspended,
    }),
    [allMerchants, initialCounts],
  )

  function openConfirm(merchant: Merchant, action: "suspend" | "reactivate") {
    setConfirmMerchant(merchant)
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  async function handleConfirm() {
    if (!confirmMerchant || !confirmAction) return
    setConfirmLoading(true)
    try {
      if (confirmAction === "suspend") {
        await suspendMerchant(confirmMerchant.id)
        toast.success(`${confirmMerchant.businessName} suspended.`)
      } else if (confirmAction === "reactivate") {
        await reactivateMerchant(confirmMerchant.id)
        toast.success(`${confirmMerchant.businessName} reactivated.`)
      }
      setConfirmOpen(false)
    } finally {
      setConfirmLoading(false)
      setConfirmMerchant(null)
      setConfirmAction(null)
    }
  }

  const columns: DataTableColumn<Merchant>[] = [
    {
      id: "business",
      header: columnLabels.merchant.business,
      sortable: true,
      sortValue: (m) => m.businessName,
      cell: (m) => (
        <CellTwoRow
          primary={<span className="font-medium">{m.businessName}</span>}
          secondary={m.email}
        />
      ),
    },
    {
      id: "owner",
      header: columnLabels.merchant.owner,
      sortable: true,
      sortValue: (m) => m.ownerName,
      cell: (m) => <CellTwoRow primary={m.ownerName} secondary={m.phone} />,
    },
    {
      id: "status",
      header: columnLabels.merchant.status,
      sortable: true,
      sortValue: (m) => m.status,
      cell: (m) => <MerchantStatusBadge status={m.status} />,
    },
    {
      id: "emailVerified",
      header: columnLabels.merchant.emailVerified,
      sortValue: (m) => (m.emailVerifiedAt ? "Verified" : "Not verified"),
      cell: (m) =>
        m.emailVerifiedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-chart-2">
            <MailCheck className="size-3.5" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="size-3.5" />
            Not verified
          </span>
        ),
    },
    {
      id: "phoneVerified",
      header: "Phone",
      sortValue: (m) => (m.phoneVerifiedAt ? "Verified" : "Not verified"),
      cell: (m) =>
        m.phoneVerifiedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-chart-2">
            <MailCheck className="size-3.5" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="size-3.5" />
            Not verified
          </span>
        ),
    },
    {
      id: "nidVerified",
      header: "NID",
      sortValue: (m) =>
        m.nidVerifiedAt
          ? "Verified"
          : m.nidSubmittedAt
            ? "Pending"
            : "Not uploaded",
      cell: (m) =>
        m.nidVerifiedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-chart-2">
            <CheckCircle2 className="size-3.5" />
            Verified
          </span>
        ) : m.nidSubmittedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-chart-3">
            <FileText className="size-3.5" />
            Pending
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            Not uploaded
          </span>
        ),
    },
    {
      id: "pendingBalance",
      header: columnLabels.merchant.pending,
      align: "right",
      sortable: true,
      sortValue: (m) => m.pendingBalance ?? 0,
      cell: (m) =>
        m.pendingBalance != null && m.pendingBalance > 0 ? (
          <span className="text-chart-3 text-sm font-medium tabular-nums">
            {formatTk(m.pendingBalance)}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      id: "balance",
      header: columnLabels.merchant.balance,
      align: "right",
      sortable: true,
      sortValue: (m) => m.balance ?? 0,
      cell: (m) =>
        m.balance != null && m.balance > 0 ? (
          <span className="text-chart-3 text-sm font-medium tabular-nums">
            {formatTk(m.balance)}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (m) => (
        <div className="flex items-center justify-end gap-2">
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
              <DropdownMenuItem
                onClick={() => router.push(`/dashboard/merchants/${m.id}`)}
              >
                <Store className="size-4" />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/dashboard/merchants/${m.id}/balance`)
                }
              >
                <Coins className="size-4" />
                View balance
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid={`merchant-assign-package-${m.id}`}
                onClick={() => setAssignTarget(m)}
              >
                <PackagePlus className="size-4" />
                Assign package
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {m.status === "SUSPENDED" ? (
                <DropdownMenuItem onClick={() => openConfirm(m, "reactivate")}>
                  <RotateCcw className="size-4" />
                  Reactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={m.status === "PENDING"}
                  onClick={() => openConfirm(m, "suspend")}
                >
                  <Ban className="size-4" />
                  Suspend
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  const quickFilterSections = [
    {
      label: "Email Verification",
      filters: [
        {
          label: "Verified",
          value: "verified",
          active: emailVerified === "true",
          onToggle: () => {
            setEmailVerified(emailVerified === "true" ? undefined : "true")
            setPage(1)
          },
        },
        {
          label: "Not verified",
          value: "not_verified",
          active: emailVerified === "false",
          onToggle: () => {
            setEmailVerified(emailVerified === "false" ? undefined : "false")
            setPage(1)
          },
        },
      ],
    },
    {
      label: "NID Status",
      filters: [
        {
          label: "Submitted",
          value: "pending",
          active: nidStatus === "pending",
          onToggle: () => {
            setNidStatus(nidStatus === "pending" ? undefined : "pending")
            setPage(1)
          },
        },
        {
          label: "Verified",
          value: "verified",
          active: nidStatus === "verified",
          onToggle: () => {
            setNidStatus(nidStatus === "verified" ? undefined : "verified")
            setPage(1)
          },
        },
        {
          label: "Rejected",
          value: "rejected",
          active: nidStatus === "rejected",
          onToggle: () => {
            setNidStatus(nidStatus === "rejected" ? undefined : "rejected")
            setPage(1)
          },
        },
      ],
    },
  ]

  const activeFilterCount = (emailVerified ? 1 : 0) + (nidStatus ? 1 : 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.merchants.title}
        description={pageContent.dashboard.merchants.description}
      />

      <StatCardList
        columns={3}
        items={[
          {
            label: statCardLabels.dashboard.merchants.totalMerchants.label,
            value: counts.total,
            icon: Store,
          },
          {
            label: statCardLabels.dashboard.merchants.active.label,
            value: counts.active,
            icon: CheckCircle2,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.dashboard.merchants.suspended.label,
            value: counts.suspended,
            icon: Ban,
            tone: "bg-destructive/10 text-destructive",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["business"]}
            id="dashboard-merchants"
            searchable
            searchColumns={["business", "owner"]}
            toolbarLeft={
              <div className="flex items-center gap-3">
                <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="ALL">All</TabsTrigger>
                    <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                    <TabsTrigger value="SUSPENDED">Suspended</TabsTrigger>
                  </TabsList>
                </Tabs>
                <QuickFilters
                  sections={quickFilterSections}
                  activeCount={activeFilterCount}
                  onClearAll={() => {
                    setEmailVerified(undefined)
                    setNidStatus(undefined)
                    setPage(1)
                  }}
                />
              </div>
            }
            columns={columns}
            data={merchants}
            getRowKey={(m) => m.id}
            initialSortId="business"
            emptyMessage="No merchants match the current filters."
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
            bulkLoading={bulkBusy}
            selectedKeys={selectedMerchants}
            onSelectionChange={setSelectedMerchants}
            bulkActions={[
              ...(tab === "ACTIVE"
                ? [
                    {
                      label: "Suspend",
                      variant: "destructive" as const,
                      icon: <Ban className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (rows: Merchant[], clear: () => void) => {
                        await handleBulkSuspend(rows.map((m) => m.id))
                        clear()
                      },
                    },
                  ]
                : []),
              ...(tab === "SUSPENDED"
                ? [
                    {
                      label: "Reactivate",
                      icon: <RotateCcw className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (rows: Merchant[], clear: () => void) => {
                        await handleBulkReactivate(rows.map((m) => m.id))
                        clear()
                      },
                    },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <AssignPackageDialog
        merchant={
          assignTarget
            ? { id: assignTarget.id, businessName: assignTarget.businessName }
            : null
        }
        onClose={() => setAssignTarget(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        loading={confirmLoading}
        title={
          confirmAction === "suspend"
            ? "Suspend merchant"
            : "Reactivate merchant"
        }
        description={
          confirmAction === "suspend"
            ? `Suspend ${confirmMerchant?.businessName}? They will no longer be able to create orders.`
            : `Reactivate ${confirmMerchant?.businessName}? They will regain access.`
        }
        confirmLabel={confirmAction === "suspend" ? "Suspend" : "Reactivate"}
        variant={confirmAction === "suspend" ? "destructive" : "default"}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={bulkSuspendOpen}
        onOpenChange={setBulkSuspendOpen}
        title="Suspend merchants"
        description={`Suspend ${bulkSuspendIds.length} merchant${bulkSuspendIds.length === 1 ? "" : "s"}? They will no longer be able to create orders.`}
        confirmLabel="Suspend"
        variant="destructive"
        loading={bulkBusy}
        onConfirm={confirmBulkSuspend}
      />

      <ConfirmDialog
        open={bulkReactivateOpen}
        onOpenChange={setBulkReactivateOpen}
        title="Reactivate merchants"
        description={`Reactivate ${bulkReactivateIds.length} merchant${bulkReactivateIds.length === 1 ? "" : "s"}? They will regain access.`}
        confirmLabel="Reactivate"
        loading={bulkBusy}
        onConfirm={confirmBulkReactivate}
      />
    </div>
  )
}
