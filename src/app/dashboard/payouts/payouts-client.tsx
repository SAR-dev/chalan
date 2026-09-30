"use client"

import {
  Banknote,
  Check,
  Clock,
  Loader2,
  MoreHorizontal,
  Wallet,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
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
import { usePayoutRequestColumns } from "@/features/payouts/components/payout-table-columns"
import { RejectPayoutDialog } from "@/features/payouts/dialogs/reject-payout-dialog"
import { usePayouts } from "@/features/payouts/hooks/use-payouts"
import type { PayoutRequest } from "@/lib/types"

type FilterTab = "PENDING" | "APPROVED" | "HISTORY"

const TAB_STATUSES: Record<FilterTab, string[] | undefined> = {
  PENDING: ["PENDING"],
  APPROVED: ["APPROVED"],
  HISTORY: ["PAID", "REJECTED"],
}

export function PayoutsPageClient({
  initialData,
  initialTotal,
  initialCounts,
}: {
  initialData: PayoutRequest[]
  initialTotal: number
  initialCounts: {
    pending: number
    approved: number
    paid: number
    rejected: number
  }
}) {
  const {
    payoutRequests,
    allPayoutRequests,
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
    approvePayout,
    approvePayouts,
    rejectPayout,
    rejectPayouts,
    isLoading,
    isRefreshing,
    markPayoutPaid,
    markPayoutsPaid,
    mutate: refresh,
  } = usePayouts({ initialData, initialTotal })
  const baseColumns = usePayoutRequestColumns({ showMerchantName: true })
  const [tab, setTab] = useState<FilterTab>("PENDING")
  const [selectedPayouts, setSelectedPayouts] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const [bulkRejectIds, setBulkRejectIds] = useState<string[]>([])

  async function handleBulkApprove(ids: string[]) {
    setBulkBusy(true)
    const res = await approvePayouts(ids)
    if (res.ok) {
      toast.success(
        `${ids.length} payout request${ids.length === 1 ? "" : "s"} approved.`,
      )
    } else {
      toast.error(res.error ?? "Could not approve payout requests.")
    }
    setBulkBusy(false)
  }

  async function handleBulkMarkPaid(ids: string[]) {
    setBulkBusy(true)
    const res = await markPayoutsPaid(ids)
    if (res.ok) {
      toast.success(
        `${ids.length} payout${ids.length === 1 ? "" : "s"} marked as paid.`,
      )
    } else {
      toast.error(res.error ?? "Could not mark payouts as paid.")
    }
    setBulkBusy(false)
  }

  async function handleBulkReject(ids: string[]) {
    setBulkRejectIds(ids)
    setBulkRejectOpen(true)
  }

  async function confirmBulkReject() {
    setBulkBusy(true)
    const res = await rejectPayouts(bulkRejectIds, "Bulk reject")
    if (res.ok) {
      toast.success(
        `${bulkRejectIds.length} payout request${bulkRejectIds.length === 1 ? "" : "s"} rejected.`,
      )
    } else {
      toast.error(res.error ?? "Could not reject payout requests.")
    }
    setBulkBusy(false)
    setBulkRejectOpen(false)
    setBulkRejectIds([])
  }
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PayoutRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [confirmPayout, setConfirmPayout] = useState<PayoutRequest | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    "approve" | "markPaid" | null
  >(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setStatuses(TAB_STATUSES[tab])
    setPage(1)
  }, [tab, setStatuses, setPage])

  const pendingCount =
    allPayoutRequests.filter((p) => p.status === "PENDING").length ||
    initialCounts.pending
  const approvedCount =
    allPayoutRequests.filter((p) => p.status === "APPROVED").length ||
    initialCounts.approved
  const paidCount =
    allPayoutRequests.filter((p) => p.status === "PAID").length ||
    initialCounts.paid
  const rejectedCount =
    allPayoutRequests.filter((p) => p.status === "REJECTED").length ||
    initialCounts.rejected

  function openConfirm(req: PayoutRequest, action: "approve" | "markPaid") {
    setConfirmPayout(req)
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  async function handleConfirm() {
    if (!confirmPayout || !confirmAction) return
    setBusy(confirmPayout.id)
    try {
      if (confirmAction === "approve") {
        const result = await approvePayout(confirmPayout.id)
        if (result.ok) {
          toast.success(
            `${confirmPayout.id} approved. Mark it paid once funds are sent.`,
          )
        } else {
          toast.error(result.error ?? "Unable to approve this request.")
        }
      } else {
        const result = await markPayoutPaid(confirmPayout.id)
        if (result.ok) {
          toast.success(`${confirmPayout.id} marked as paid.`)
        } else {
          toast.error(result.error ?? "Unable to mark this request as paid.")
        }
      }
    } finally {
      setBusy(null)
      setConfirmOpen(false)
      setConfirmPayout(null)
      setConfirmAction(null)
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return
    const result = await rejectPayout(rejectTarget.id, rejectReason)
    if (result.ok) {
      toast.success(
        `${rejectTarget.id} rejected. Its orders are available again.`,
      )
      setRejectTarget(null)
      setRejectReason("")
    } else {
      toast.error("Unable to reject this request.")
    }
  }

  const columns: DataTableColumn<PayoutRequest>[] = [
    ...baseColumns,
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (p) => {
        const isPending = p.status === "PENDING"
        const isApproved = p.status === "APPROVED"
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
                {isPending && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setRejectTarget(p)
                        setRejectReason("")
                      }}
                      disabled={busy === p.id}
                    >
                      <X className="size-4" />
                      Reject
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openConfirm(p, "approve")}
                      disabled={busy === p.id}
                    >
                      {busy === p.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      Approve
                    </DropdownMenuItem>
                  </>
                )}
                {isApproved && (
                  <DropdownMenuItem
                    onClick={() => openConfirm(p, "markPaid")}
                    disabled={busy === p.id}
                  >
                    {busy === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Banknote className="size-4" />
                    )}
                    Mark as paid
                  </DropdownMenuItem>
                )}
                {!isPending && !isApproved && (
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
        title={pageContent.dashboard.payouts.title}
        description={pageContent.dashboard.payouts.description}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.dashboard.payouts.pendingReview.label,
            value: pendingCount,
            icon: Clock,
            tone: "bg-chart-3/15 text-chart-3",
          },
          {
            label:
              statCardLabels.dashboard.payouts.approvedAwaitingPayment.label,
            value: approvedCount,
            icon: Wallet,
            tone: "bg-chart-1/15 text-chart-1",
          },
          {
            label: statCardLabels.dashboard.payouts.paid.label,
            value: paidCount,
            icon: Banknote,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: statCardLabels.dashboard.payouts.rejected.label,
            value: rejectedCount,
            icon: X,
            tone: "bg-destructive/15 text-destructive",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["request"]}
            id="dashboard-payouts"
            searchable
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="PENDING">Pending</TabsTrigger>
                  <TabsTrigger value="APPROVED">Approved</TabsTrigger>
                  <TabsTrigger value="HISTORY">History</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={payoutRequests}
            getRowKey={(p) => p.id}
            initialSortId="requested"
            initialSortDir="desc"
            loading={isLoading || isRefreshing}
            emptyMessage={
              tab === "PENDING"
                ? "No payout requests to review. New merchant requests will appear here."
                : tab === "APPROVED"
                  ? "No approved requests awaiting payment."
                  : "No paid or rejected requests yet."
            }
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
            selectedKeys={selectedPayouts}
            onSelectionChange={setSelectedPayouts}
            bulkActions={[
              ...(tab === "PENDING"
                ? [
                    {
                      label: "Approve",
                      icon: <Check className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (
                        rows: PayoutRequest[],
                        clear: () => void,
                      ) => {
                        await handleBulkApprove(rows.map((p) => p.id))
                        clear()
                      },
                    },
                    {
                      label: "Reject",
                      variant: "destructive" as const,
                      icon: <X className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (
                        rows: PayoutRequest[],
                        clear: () => void,
                      ) => {
                        await handleBulkReject(rows.map((p) => p.id))
                        clear()
                      },
                    },
                  ]
                : []),
              ...(tab === "APPROVED"
                ? [
                    {
                      label: "Mark paid",
                      icon: <Banknote className="size-4" />,
                      disabled: bulkBusy,
                      onClick: async (
                        rows: PayoutRequest[],
                        clear: () => void,
                      ) => {
                        await handleBulkMarkPaid(rows.map((p) => p.id))
                        clear()
                      },
                    },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <RejectPayoutDialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null)
            setRejectReason("")
          }
        }}
        target={rejectTarget}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onConfirm={confirmReject}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirmAction === "approve"
            ? "Approve payout request"
            : "Mark payout as paid"
        }
        description={
          confirmAction === "approve"
            ? `Approve ${confirmPayout?.id}?`
            : `Mark ${confirmPayout?.id} as paid? This cannot be undone.`
        }
        confirmLabel={confirmAction === "approve" ? "Approve" : "Mark as paid"}
        variant={confirmAction === "markPaid" ? "destructive" : "default"}
        // One dialog serves both actions, so the button has to say which it is —
        // a shared `confirm-button` could not be addressed without also
        // matching the other, nor distinguished from the bulk dialogs below.
        testId={
          confirmAction === "approve" ? "approve-payout" : "mark-paid-payout"
        }
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={bulkRejectOpen}
        onOpenChange={setBulkRejectOpen}
        title="Reject payout requests"
        description={`Reject ${bulkRejectIds.length} payout request${bulkRejectIds.length === 1 ? "" : "s"}? Their orders will be unlocked for re-request.`}
        confirmLabel="Reject"
        variant="destructive"
        loading={bulkBusy}
        onConfirm={confirmBulkReject}
      />
    </div>
  )
}
