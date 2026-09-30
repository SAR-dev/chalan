"use client"

import { CheckCircle2, FileText, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { RejectNidDialog } from "@/features/merchants/dialogs/reject-nid-dialog"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import type { Merchant } from "@/lib/types"

type NidFilter = "all" | "pending" | "verified" | "rejected"

function formatNidDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function NidReviewsPage() {
  const router = useRouter()
  const {
    merchants,
    allMerchants,
    total,
    setPage,
    isLoading,
    isRefreshing,
    setLimit,
    query,
    setQuery,
    setNidStatus,
    sortId,
    sortDir,
    onSortChange,
    mutate,
  } = useMerchants()

  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(
    new Set(),
  )
  const [rejectMerchant, setRejectMerchant] = useState<Merchant | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [nidFilter, setNidFilter] = useState<NidFilter>("pending")
  const [approveMerchant, setApproveMerchant] = useState<Merchant | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [_viewMerchant, setViewMerchant] = useState<Merchant | null>(null)
  const [_viewOpen, setViewOpen] = useState(false)
  const [_viewLoading, setViewLoading] = useState(false)

  function _openView(merchant: Merchant) {
    setViewMerchant(merchant)
    setViewOpen(true)
    setViewLoading(true)
    fetch(`/api/merchants/${merchant.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) setViewMerchant(data)
      })
      .finally(() => setViewLoading(false))
  }

  const isNidPending = (m: Merchant) =>
    Boolean(m.nidSubmittedAt) && !m.nidVerifiedAt && !m.nidRejectedAt

  useEffect(() => {
    setNidStatus(nidFilter === "all" ? undefined : nidFilter)
    setPage(1)
  }, [nidFilter, setNidStatus, setPage])

  function openApprove(merchant: Merchant) {
    setApproveMerchant(merchant)
    setApproveOpen(true)
  }

  async function handleApprove() {
    if (!approveMerchant) return
    setReviewing(true)
    try {
      const res = await fetch(
        `/api/merchants/${approveMerchant.id}/nid/verify`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Failed to verify NID")
        return
      }
      toast.success(`NID verified for ${approveMerchant.businessName}`)
      setApproveOpen(false)
      mutate()
    } finally {
      setReviewing(false)
    }
  }

  function openReject(merchant: Merchant) {
    setRejectMerchant(merchant)
    setRejectReason("")
    setRejectOpen(true)
  }

  async function handleReject() {
    if (!rejectMerchant) return
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required")
      return
    }
    setReviewing(true)
    try {
      const res = await fetch(
        `/api/merchants/${rejectMerchant.id}/nid/verify`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject",
            reason: rejectReason.trim(),
          }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error || "Failed to reject NID")
        return
      }
      toast.success(`NID rejected for ${rejectMerchant.businessName}`)
      setRejectOpen(false)
      mutate()
    } finally {
      setReviewing(false)
    }
  }

  const columns: DataTableColumn<Merchant>[] = [
    {
      id: "business",
      header: columnLabels.merchant.business,
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
      sortValue: (m) => m.ownerName,
      cell: (m) => <CellTwoRow primary={m.ownerName} secondary={m.phone} />,
    },
    {
      id: "nidNumber",
      header: "NID Number",
      sortValue: (m) => m.nidNumber || "—",
      cell: (m) => <span>{m.nidNumber || "—"}</span>,
    },
    {
      id: "submittedAt",
      header: "Submitted",
      sortValue: (m) =>
        m.nidSubmittedAt ? formatNidDate(m.nidSubmittedAt) : "—",
      cell: (m) =>
        m.nidSubmittedAt ? (
          <span>{formatNidDate(m.nidSubmittedAt)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-32",
      cell: (m) => (
        <div className="flex items-center justify-end gap-2">
          {isNidPending(m) && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-chart-2"
                disabled={reviewing}
                onClick={() => openApprove(m)}
              >
                <CheckCircle2 className="size-4" />
                <span className="sr-only">Approve</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive"
                disabled={reviewing}
                onClick={() => openReject(m)}
              >
                <XCircle className="size-4" />
                <span className="sr-only">Reject</span>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => router.push(`/dashboard/merchants/${m.id}`)}
          >
            <FileText className="size-4" />
            <span className="sr-only">View details</span>
          </Button>
        </div>
      ),
    },
  ]

  const allCount = allMerchants.length
  const pendingCount = allMerchants.filter(isNidPending).length
  const verifiedCount = allMerchants.filter((m) => m.nidVerifiedAt).length
  const rejectedCount = allMerchants.filter((m) => m.nidRejectedAt).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.nidReviews.title}
        description={pageContent.dashboard.nidReviews.description}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: "All",
            value: allCount,
            icon: FileText,
          },
          {
            label: "Pending",
            value: pendingCount,
            icon: FileText,
            tone: "bg-chart-3/15 text-chart-3",
          },
          {
            label: "Verified",
            value: verifiedCount,
            icon: CheckCircle2,
            tone: "bg-chart-2/15 text-chart-2",
          },
          {
            label: "Rejected",
            value: rejectedCount,
            icon: XCircle,
            tone: "bg-destructive/10 text-destructive",
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["business"]}
            id="dashboard-nid-reviews"
            searchable
            searchColumns={["business", "owner", "nidNumber"]}
            toolbarLeft={
              <Tabs
                value={nidFilter}
                onValueChange={(v) => setNidFilter(v as NidFilter)}
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="verified">Verified</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={merchants}
            getRowKey={(m) => m.id}
            initialSortId="submittedAt"
            emptyMessage={
              nidFilter === "pending"
                ? "No pending NID submissions."
                : nidFilter === "verified"
                  ? "No verified NIDs."
                  : nidFilter === "rejected"
                    ? "No rejected NIDs."
                    : "No NID submissions."
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
            onRefresh={mutate}
            selectedKeys={selectedMerchants}
            onSelectionChange={setSelectedMerchants}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve NID"
        description={`Approve NID for ${approveMerchant?.businessName}? This will mark their NID as verified.`}
        confirmLabel="Approve"
        loading={reviewing}
        onConfirm={handleApprove}
      />

      <RejectNidDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        merchant={rejectMerchant}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onConfirm={handleReject}
        loading={reviewing}
      />
    </div>
  )
}
