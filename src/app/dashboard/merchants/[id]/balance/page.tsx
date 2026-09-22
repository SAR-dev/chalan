"use client"

import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  SlidersHorizontal,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useEffect, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { FormDialog } from "@/components/form-dialog"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchantBalance } from "@/features/merchants/hooks/use-merchant-balance"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { formatTk } from "@/lib/pricing"
import type { BalanceTransaction } from "@/lib/types"

const TX_TYPE_LABELS: Record<string, string> = {
  ORDER_CHARGE: "Order charge",
  PAYMENT_PENDING: "Payment",
  PAYMENT_CONFIRMED: "Payment",
  ADJUSTMENT: "Adjustment",
}

export default function MerchantBalancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: merchantId } = use(params)
  const router = useRouter()
  const { currentUser } = useAuth()
  const { merchants } = useMerchants()

  const isPrivilegedAdmin = currentUser?.role === "SUPER_ADMIN"
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"

  useEffect(() => {
    if (currentUser && !isPrivilegedAdmin) {
      router.replace("/dashboard")
    }
  }, [currentUser, isPrivilegedAdmin, router])

  const {
    balance,
    transactions,
    total,
    isLoading,
    page: _page,
    setPage,
    limit: _limit,
    setLimit,
    sortId,
    sortDir,
    onSortChange,
    confirmPayment,
    rejectPayment,
    adjustBalance,
  } = useMerchantBalance(merchantId)

  const merchant = merchants.find((m) => m.id === merchantId)
  const pendingPayments = transactions.filter(
    (t) => t.type === "PAYMENT_PENDING" && t.status === "PENDING",
  )

  // Confirm payment state
  const [confirmTx, setConfirmTx] = useState<BalanceTransaction | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Reject payment state
  const [rejectTx, setRejectTx] = useState<BalanceTransaction | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectLoading, setRejectLoading] = useState(false)

  // Adjust balance state
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustAmount, setAdjustAmount] = useState("")
  const [adjustNote, setAdjustNote] = useState("")
  const [adjustLoading, setAdjustLoading] = useState(false)

  async function handleConfirmPayment() {
    if (!confirmTx) return
    setConfirmLoading(true)
    const result = await confirmPayment(confirmTx.id)
    setConfirmLoading(false)
    if (!result.ok) {
      toast.error(result.error ?? "Failed to confirm payment.")
      return
    }
    toast.success("Payment confirmed and balance updated.")
    setConfirmOpen(false)
    setConfirmTx(null)
  }

  async function handleRejectPayment() {
    if (!rejectTx || !rejectReason.trim()) {
      toast.error("Enter a rejection reason.")
      return
    }
    setRejectLoading(true)
    const result = await rejectPayment(rejectTx.id, rejectReason.trim())
    setRejectLoading(false)
    if (!result.ok) {
      toast.error(result.error ?? "Failed to reject payment.")
      return
    }
    toast.success("Payment rejected.")
    setRejectOpen(false)
    setRejectTx(null)
    setRejectReason("")
  }

  async function handleAdjust() {
    const parsed = parseFloat(adjustAmount)
    if (!adjustAmount || isNaN(parsed) || parsed === 0) {
      toast.error("Enter a non-zero adjustment amount.")
      return
    }
    if (!adjustNote.trim()) {
      toast.error("Enter a note explaining the adjustment.")
      return
    }
    setAdjustLoading(true)
    const result = await adjustBalance(parsed, adjustNote.trim())
    setAdjustLoading(false)
    if (!result.ok) {
      toast.error(result.error ?? "Failed to apply adjustment.")
      return
    }
    toast.success("Balance adjusted.")
    setAdjustOpen(false)
    setAdjustAmount("")
    setAdjustNote("")
  }

  const historyColumns: DataTableColumn<BalanceTransaction>[] = [
    {
      id: "date",
      header: "Date",
      sortable: true,
      sortValue: (t) => t.createdAt ?? "",
      cellClassName: "text-sm text-muted-foreground whitespace-nowrap",
      cell: (t) =>
        t.createdAt
          ? new Date(t.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—",
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      sortValue: (t) => t.type,
      cell: (t) => (
        <span className="text-sm font-medium">
          {TX_TYPE_LABELS[t.type] ?? t.type}
        </span>
      ),
    },
    {
      id: "note",
      header: "Description",
      cellClassName: "text-sm text-muted-foreground",
      cell: (t) => t.note ?? "—",
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortValue: (t) => t.amount,
      cell: (t) => (
        <span
          className={`text-sm font-medium tabular-nums ${
            t.amount > 0 ? "text-destructive" : "text-chart-2"
          }`}
        >
          {t.amount > 0 ? "+" : ""}
          {formatTk(t.amount)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (t) => t.status,
      cell: (t) => {
        if (t.type === "ORDER_CHARGE" || t.type === "ADJUSTMENT") return null
        if (t.status === "PENDING")
          return <StatusBadge label="Pending" tone="pending" />
        if (t.status === "SETTLED")
          return <StatusBadge label="Confirmed" tone="success" />
        if (t.status === "REJECTED")
          return <StatusBadge label="Rejected" tone="danger" />
        return null
      },
    },
    {
      id: "reviewedBy",
      header: "Confirmed by",
      cellClassName: "text-sm text-muted-foreground",
      cell: (t) =>
        t.status === "SETTLED" && t.type === "PAYMENT_CONFIRMED"
          ? (t.reviewedBy ?? "—")
          : "—",
    },
  ]

  if (!isPrivilegedAdmin) return null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          merchant ? `${merchant.businessName} — Balance` : "Merchant Balance"
        }
        description="Review outstanding platform fee balance, confirm or reject payments, and adjust the balance if needed."
      >
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustOpen(true)}
            >
              <SlidersHorizontal className="size-4" />
              Adjust balance
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>
      </PageHeader>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="text-primary size-5" />
            Outstanding balance
          </CardTitle>
          <CardDescription>
            Total platform fee owed by this merchant. Positive = owes platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            className={`text-3xl font-bold tabular-nums ${
              balance > 0
                ? "text-chart-3"
                : balance < 0
                  ? "text-chart-2"
                  : "text-muted-foreground"
            }`}
          >
            {formatTk(balance)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {balance > 0
              ? "Merchant owes the platform"
              : balance < 0
                ? "Merchant has a credit"
                : "Fully settled"}
          </p>
        </CardContent>
      </Card>

      {/* Pending payments */}
      {pendingPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="text-primary size-5" />
              Pending payments
            </CardTitle>
            <CardDescription>
              Payments submitted by the merchant awaiting your review.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pendingPayments.map((tx) => (
              <div
                key={tx.id}
                className="border-border bg-muted/30 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium tabular-nums">
                    {formatTk(Math.abs(tx.amount))}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {tx.paymentMethod} · {tx.paymentAccount}
                  </p>
                  {tx.note && (
                    <p className="text-muted-foreground text-sm">{tx.note}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Submitted{" "}
                    {tx.createdAt
                      ? new Date(tx.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : ""}
                    {" by "}
                    {tx.createdBy}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setConfirmTx(tx)
                      setConfirmOpen(true)
                    }}
                  >
                    <CheckCircle2 className="size-4" />
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectTx(tx)
                      setRejectOpen(true)
                    }}
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>
            Full ledger of charges, payments, and adjustments for this merchant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            pinnedColumns={["date"]}
            id={`admin-merchant-balance-${merchantId}`}
            serverPaginated
            loading={isLoading}
            columns={historyColumns}
            data={transactions}
            total={total}
            pageSize={_limit}
            onPageChange={(page, limit) => {
              setPage(page)
              setLimit(limit)
            }}
            serverSortId={sortId}
            serverSortDir={sortDir}
            onSortChange={onSortChange}
            getRowKey={(t) => t.id}
            emptyMessage="No transactions yet."
          />
        </CardContent>
      </Card>

      {/* Confirm payment dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm payment"
        description={`Confirm payment of ${confirmTx ? formatTk(Math.abs(confirmTx.amount)) : ""}? This will reduce the merchant's outstanding balance.`}
        confirmLabel="Confirm payment"
        loading={confirmLoading}
        onConfirm={handleConfirmPayment}
      />

      {/* Reject payment dialog */}
      <FormDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open)
          if (!open) {
            setRejectTx(null)
            setRejectReason("")
          }
        }}
        title="Reject payment"
        description={`Reject payment of ${rejectTx ? formatTk(Math.abs(rejectTx.amount)) : ""}? The merchant's balance will not be affected.`}
        onConfirm={handleRejectPayment}
        submitting={rejectLoading}
        submittingLabel="Rejecting"
        submitLabel="Reject"
        submitVariant="destructive"
        submitIcon={<XCircle className="size-4" />}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            placeholder="Explain why this payment is being rejected…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
        </div>
      </FormDialog>

      {/* Adjust balance dialog — SUPER_ADMIN only */}
      {isSuperAdmin && (
        <FormDialog
          open={adjustOpen}
          onOpenChange={(open) => {
            setAdjustOpen(open)
            if (!open) {
              setAdjustAmount("")
              setAdjustNote("")
            }
          }}
          title="Adjust balance"
          description="Enter a positive amount to charge the merchant more, or a negative amount to credit them."
          onConfirm={handleAdjust}
          submitting={adjustLoading}
          submittingLabel="Applying"
          submitLabel="Apply adjustment"
          submitIcon={<SlidersHorizontal className="size-4" />}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="adjust-amount">
                Amount{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (positive = charge, negative = credit)
                </span>
              </Label>
              <Input
                id="adjust-amount"
                type="number"
                step="0.01"
                placeholder="e.g. 100 or -50"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="adjust-note">Note</Label>
              <Input
                id="adjust-note"
                placeholder="Reason for this adjustment"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>
          </div>
        </FormDialog>
      )}
    </div>
  )
}
