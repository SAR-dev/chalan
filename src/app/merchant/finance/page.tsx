"use client"

import {
  AlertCircle,
  Banknote,
  Clock,
  Coins,
  ExternalLink,
  Package,
  Plus,
  Wallet,
} from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { DateRangePicker } from "@/components/date-range-picker"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { columnLabels } from "@/config/table-column-labels"
import { RequestTopUpDialog } from "@/features/merchants/dialogs/request-top-up-dialog"
import { useMerchantBalance } from "@/features/merchants/hooks/use-merchant-balance"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePayoutRequestColumns } from "@/features/payouts/components/payout-table-columns"
import { PayoutRequestDialog } from "@/features/payouts/dialogs/payout-request-dialog"
import { usePayouts } from "@/features/payouts/hooks/use-payouts"
import { formatTk } from "@/lib/pricing"
import type { BalanceTransaction, Order } from "@/lib/types"

export default function MerchantFinancePage() {
  const { currentMerchant } = useMerchants()
  // `?tab=wallet` lets other pages deep-link straight to the top-up flow.
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(
    searchParams.get("tab") === "wallet" ? "wallet" : "overview",
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined)
  const [dateTo, setDateTo] = useState<string | undefined>(undefined)
  const [payablePage, setPayablePage] = useState(1)
  const [payableLimit, setPayableLimit] = useState(20)
  const {
    merchantPayableOrders,
    merchantPayableTotal,
    merchantPayableAmount,
    isLoading: isLoadingOrders,
    mutate: refreshOrders,
  } = useOrders({
    payablePage,
    payableLimit,
    payableDateFrom: dateFrom,
    payableDateTo: dateTo,
  })
  const {
    merchantPayoutRequests,
    isLoading: isLoadingPayouts,
    mutate: refreshPayouts,
  } = usePayouts()
  const requestColumns = usePayoutRequestColumns()

  // Wallet / top-ups: the payment rows of the same ledger, filtered server-side.
  const {
    balance,
    pendingBalance,
    transactions: payments,
    total: paymentsTotal,
    hasPendingPayment,
    isLoading: isLoadingPayments,
    mutate: refreshPayments,
    setPage: setPaymentsPage,
    setLimit: setPaymentsLimit,
  } = useMerchantBalance(currentMerchant?.id ?? null, { kind: "payments" })

  // A negative balance is credit the merchant holds; a positive one is money owed.
  const availableCredit = Math.max(0, -balance)
  // The most recent declined top-up, so the reason is visible without digging.
  const lastRejected = payments.find((t) => t.status === "REJECTED")

  const isActive = currentMerchant?.status === "ACTIVE"
  const canRequest = isActive && merchantPayableTotal > 0

  function _getPayableSearchValue(o: Order, columnId: string): string | null {
    switch (columnId) {
      case "tracking":
        return o.id
      case "recipient":
        return `${o.recipientName} ${o.deliveryCity}`
      case "delivered":
        return o.deliveredAt ?? null
      case "productCost":
        return String(o.productCost)
      default:
        return null
    }
  }

  function _getPayoutSearchValue(
    p: {
      id: string
      payoutMethod: string
      payoutDetails: string
      status: string
    },
    columnId: string,
  ): string | null {
    switch (columnId) {
      case "code":
        return p.id
      case "method":
        return `${p.payoutMethod} ${p.payoutDetails}`
      case "status":
        return p.status
      default:
        return null
    }
  }

  const payableColumns: DataTableColumn<Order>[] = [
    {
      id: "tracking",
      header: columnLabels.finance.tracking,
      sortable: true,
      sortValue: (o) => o.id,
      cell: (o) => (
        <a
          href={`/track/${o.trackingToken ?? o.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {o.id}
        </a>
      ),
    },
    {
      id: "recipient",
      header: columnLabels.finance.recipient,
      sortable: true,
      sortValue: (o) => o.recipientName,
      cell: (o) => (
        <div className="leading-tight">
          <p className="font-medium">{o.recipientName}</p>
          <p className="text-muted-foreground text-xs">{o.deliveryCity}</p>
        </div>
      ),
    },
    {
      id: "delivered",
      header: columnLabels.finance.delivered,
      sortable: true,
      sortValue: (o) => o.deliveredAt ?? "",
      cellClassName: "text-sm text-muted-foreground",
      cell: (o) =>
        o.deliveredAt
          ? new Date(o.deliveredAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : "—",
    },
    {
      id: "productCost",
      header: columnLabels.finance.productCost,
      align: "right",
      sortable: true,
      sortValue: (o) => o.productCost,
      cell: (o) => (
        <span className="font-medium tabular-nums">
          {formatTk(o.productCost)}
        </span>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (o) => (
        <Button
          variant="ghost"
          size="sm"
          render={
            <a
              href={`/track/${o.trackingToken ?? o.id}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          nativeButton={false}
        >
          <ExternalLink className="size-3.5" />
          Track
        </Button>
      ),
    },
  ]

  const filteredPayableOrders = merchantPayableOrders
  const filteredAvailable = merchantPayableAmount

  const paidOut = merchantPayoutRequests
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.amount, 0)

  const pendingPayout = merchantPayoutRequests
    .filter((p) => p.status === "PENDING" || p.status === "APPROVED")
    .reduce((sum, p) => sum + p.amount, 0)

  const paymentColumns: DataTableColumn<BalanceTransaction>[] = [
    {
      id: "date",
      header: "Date",
      sortable: true,
      sortValue: (t) => t.createdAt,
      cell: (t) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {new Date(t.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      sortable: true,
      sortValue: (t) => Math.abs(t.amount),
      cell: (t) => (
        <span className="font-medium tabular-nums">
          {formatTk(Math.abs(t.amount))}
        </span>
      ),
    },
    {
      id: "method",
      header: "Method",
      cell: (t) => <span className="text-sm">{t.paymentMethod ?? "—"}</span>,
    },
    {
      id: "account",
      header: "Account / reference",
      cell: (t) => (
        <span className="text-muted-foreground text-sm">
          {t.paymentAccount ?? "—"}
        </span>
      ),
    },
    {
      id: "note",
      header: "Note",
      cell: (t) => (
        <span className="text-muted-foreground text-sm">{t.note ?? "—"}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (t) => t.status,
      cell: (t) => (
        <span data-testid={`top-up-status-${t.id}`}>
          <StatusBadge
            label={t.status}
            tone={
              t.status === "SETTLED"
                ? "success"
                : t.status === "REJECTED"
                  ? "danger"
                  : "pending"
            }
          />
        </span>
      ),
    },
    {
      id: "reviewedBy",
      header: "Reviewed by",
      cell: (t) => (
        <span className="text-muted-foreground text-sm">
          {t.reviewedBy ?? "—"}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={pageContent.merchant.finance.title}
        description={pageContent.merchant.finance.description}
      >
        <Button onClick={() => setDialogOpen(true)} disabled={!canRequest}>
          <Wallet className="size-4" />
          Request payout
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="finance-tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="wallet" data-testid="finance-tab-wallet">
            Wallet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StatCardList
            columns={3}
            items={[
              {
                label: "Available for payout",
                value: formatTk(filteredAvailable),
                hint: `${merchantPayableTotal} settled order${
                  merchantPayableTotal === 1 ? "" : "s"
                }`,
                icon: Banknote,
                tone: "bg-chart-2/15 text-chart-2",
              },
              {
                label: "Paid out",
                value: formatTk(paidOut),
                hint: `${merchantPayoutRequests.filter((p) => p.status === "PAID").length} completed`,
                icon: Wallet,
                tone: "bg-chart-2/15 text-chart-2",
              },
              {
                label: "Pending payout",
                value: formatTk(pendingPayout),
                hint: `${merchantPayoutRequests.filter((p) => p.status === "PENDING" || p.status === "APPROVED").length} awaiting`,
                icon: Coins,
                tone: "bg-chart-3/15 text-chart-3",
              },
            ]}
          />

          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="text-primary size-5" />
                  Available for payout
                </CardTitle>
                <CardDescription>
                  Delivered orders whose cash has been settled and not yet
                  requested.
                </CardDescription>
              </div>
              {canRequest ? (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Wallet className="size-4" />
                  Request {formatTk(filteredAvailable)}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onFromChange={(value) => {
                  setDateFrom(value)
                  setPayablePage(1)
                }}
                onToChange={(value) => {
                  setDateTo(value)
                  setPayablePage(1)
                }}
                className="mb-4"
              />
              {filteredPayableOrders.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                    <Package className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">No funds available yet</p>
                    <p className="text-muted-foreground text-sm">
                      Funds become available once an order is delivered and the
                      warehouse settles the collected cash.
                    </p>
                  </div>
                </div>
              ) : (
                <DataTable
                  pinnedColumns={["tracking"]}
                  id="merchant-payable-orders"
                  searchable
                  searchColumns={["tracking", "recipient"]}
                  columns={payableColumns}
                  data={filteredPayableOrders}
                  getRowKey={(o) => o.id}
                  initialSortId="tracking"
                  loading={isLoadingOrders}
                  onRefresh={refreshOrders}
                  serverPaginated
                  total={merchantPayableTotal}
                  onPageChange={(page, limit) => {
                    setPayablePage(page)
                    setPayableLimit(limit)
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Payout requests</CardTitle>
              <CardDescription>
                Every payout you&apos;ve requested, newest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {merchantPayoutRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                    <Wallet className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">No payout requests yet</p>
                    <p className="text-muted-foreground text-sm">
                      Submit a request once you have available funds.
                    </p>
                  </div>
                </div>
              ) : (
                <DataTable
                  pinnedColumns={["request"]}
                  id="merchant-payout-requests"
                  searchable
                  searchColumns={["request", "method", "status"]}
                  columns={requestColumns}
                  data={merchantPayoutRequests}
                  getRowKey={(p) => p.id}
                  initialSortId="requested"
                  initialSortDir="desc"
                  loading={isLoadingPayouts}
                  onRefresh={refreshPayouts}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet">
          <StatCardList
            columns={2}
            items={[
              {
                label: "Available credit",
                value: formatTk(availableCredit),
                hint: "Prepaid balance, spendable on orders and packages",
                icon: Wallet,
                tone: "bg-chart-2/15 text-chart-2",
              },
              {
                label: "Awaiting confirmation",
                value: formatTk(pendingBalance),
                hint: "Top-ups submitted, not yet confirmed",
                icon: Clock,
                tone: "bg-chart-3/15 text-chart-3",
              },
            ]}
          />

          {hasPendingPayment ? (
            <div
              data-testid="wallet-pending-banner"
              className="border-border bg-muted/50 mt-6 flex items-start gap-2 rounded-lg border p-3 text-sm"
            >
              <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <span>
                A top-up is awaiting admin confirmation. You can submit another
                once it has been reviewed.
              </span>
            </div>
          ) : null}

          {lastRejected ? (
            <div
              data-testid="wallet-rejected-banner"
              className="border-destructive/30 bg-destructive/10 text-destructive mt-6 flex items-start gap-2 rounded-lg border p-3 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                Your top-up of {formatTk(Math.abs(lastRejected.amount))} was
                declined
                {lastRejected.rejectReason
                  ? `: ${lastRejected.rejectReason}`
                  : "."}
              </span>
            </div>
          ) : null}

          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Top-up history</CardTitle>
                <CardDescription>
                  Manual transfers you submitted, newest first.
                </CardDescription>
              </div>
              <Button
                size="sm"
                data-testid="top-up-request"
                disabled={hasPendingPayment}
                onClick={() => setTopUpOpen(true)}
              >
                <Plus className="size-4" />
                Request top-up
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                pinnedColumns={["date"]}
                id="merchant-top-ups"
                searchable
                searchColumns={["method", "account", "status"]}
                columns={paymentColumns}
                data={payments}
                getRowKey={(t) => t.id}
                emptyMessage="No top-ups yet."
                initialSortId="date"
                initialSortDir="desc"
                loading={isLoadingPayments}
                onRefresh={refreshPayments}
                serverPaginated
                total={paymentsTotal}
                onPageChange={(page, limit) => {
                  setPaymentsPage(page)
                  setPaymentsLimit(limit)
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayoutRequestDialog
        payableOrders={merchantPayableOrders}
        payableTotal={merchantPayableTotal}
        payableAmount={merchantPayableAmount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <RequestTopUpDialog
        merchantId={currentMerchant?.id ?? null}
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
      />
    </>
  )
}
