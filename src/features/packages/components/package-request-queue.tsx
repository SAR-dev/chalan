"use client"

import { Check, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RejectRequestDialog } from "@/features/packages/dialogs/reject-request-dialog"
import { usePackageRequests } from "@/features/packages/hooks/use-package-requests"
import { formatTk } from "@/lib/pricing"

type TabFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL"

/** Admin review queue for package purchase requests. */
export function PackageRequestQueue() {
  const { requests, approve, reject, isLoading, isRefreshing } =
    usePackageRequests()
  const [tab, setTab] = useState<TabFilter>("PENDING")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<(typeof requests)[number] | null>(
    null,
  )
  const [reason, setReason] = useState("")

  const rows =
    tab === "ALL" ? requests : requests.filter((r) => r.status === tab)

  async function handleApprove(id: string) {
    setBusyId(id)
    const res = await approve(id)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error ?? "Could not approve the request.")
      return
    }
    toast.success("Package approved — the merchant's bundle is now active.")
  }

  async function handleReject() {
    if (!rejecting) return
    setBusyId(rejecting.id)
    const res = await reject(rejecting.id, reason)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error ?? "Could not reject the request.")
      return
    }
    toast.success("Package request rejected.")
    setRejecting(null)
    setReason("")
  }

  const columns: DataTableColumn<(typeof requests)[number]>[] = [
    {
      id: "merchant",
      header: "Merchant",
      sortable: true,
      sortValue: (r) => r.merchantName,
      cell: (r) => (
        <CellTwoRow primary={r.merchantName} secondary={r.packageName} />
      ),
    },
    {
      id: "amount",
      header: "Amount",
      sortable: true,
      sortValue: (r) => Number(r.amount),
      cell: (r) => (
        <span className="font-medium">{formatTk(Number(r.amount))}</span>
      ),
    },
    {
      id: "requestedAt",
      header: "Requested",
      sortable: true,
      sortValue: (r) => r.requestedAt,
      headClassName: "hidden lg:table-cell",
      cellClassName: "hidden lg:table-cell",
      cell: (r) => (
        <span className="text-muted-foreground text-sm">
          {new Date(r.requestedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "note",
      header: "Note",
      headClassName: "hidden xl:table-cell",
      cellClassName: "hidden xl:table-cell",
      cell: (r) => (
        <span className="text-muted-foreground text-sm">
          {r.note || r.rejectReason || "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge
          label={r.status.charAt(0) + r.status.slice(1).toLowerCase()}
          tone={
            r.status === "APPROVED"
              ? "success"
              : r.status === "REJECTED"
                ? "danger"
                : "pending"
          }
        />
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-24",
      cell: (r) =>
        r.status === "PENDING" ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              data-testid={`request-approve-${r.id}`}
              disabled={busyId === r.id}
              onClick={() => handleApprove(r.id)}
            >
              <Check className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              data-testid={`request-reject-${r.id}`}
              disabled={busyId === r.id}
              onClick={() => setRejecting(r)}
            >
              <X className="size-4" />
              <span className="sr-only">Reject</span>
            </Button>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">
            {r.reviewedBy ?? "—"}
          </span>
        ),
    },
  ]

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["merchant"]}
            id="dashboard-package-requests"
            searchable
            searchColumns={["merchant"]}
            toolbarLeft={
              <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
                <TabsList>
                  <TabsTrigger
                    value="PENDING"
                    data-testid="requests-tab-pending"
                  >
                    Pending
                  </TabsTrigger>
                  <TabsTrigger
                    value="APPROVED"
                    data-testid="requests-tab-approved"
                  >
                    Approved
                  </TabsTrigger>
                  <TabsTrigger
                    value="REJECTED"
                    data-testid="requests-tab-rejected"
                  >
                    Rejected
                  </TabsTrigger>
                  <TabsTrigger value="ALL" data-testid="requests-tab-all">
                    All
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
            columns={columns}
            data={rows}
            getRowKey={(r) => r.id}
            emptyMessage="No package purchase requests."
            loading={isLoading || isRefreshing}
          />
        </CardContent>
      </Card>

      <RejectRequestDialog
        target={rejecting}
        reason={reason}
        onReasonChange={setReason}
        onOpenChange={(o) => {
          if (!o) {
            setRejecting(null)
            setReason("")
          }
        }}
        onConfirm={handleReject}
        loading={busyId !== null}
      />
    </>
  )
}
