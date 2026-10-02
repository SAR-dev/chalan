"use client"

import {
  CellContent,
  CellTwoRow,
  type DataTableColumn,
} from "@/components/data-table"
import { columnLabels } from "@/config/table-column-labels"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { formatDateTime } from "@/lib/format"
import { formatTk } from "@/lib/pricing"
import type { PayoutRequest } from "@/lib/types"
import { PayoutStatusBadge } from "./payout-status-badge"

interface UsePayoutRequestColumnsOptions {
  showMerchantName?: boolean
}

export function usePayoutRequestColumns({
  showMerchantName = false,
}: UsePayoutRequestColumnsOptions = {}): DataTableColumn<PayoutRequest>[] {
  const { merchants } = useMerchants()

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Merchant"

  const columns: DataTableColumn<PayoutRequest>[] = [
    {
      id: "request",
      header: columnLabels.payout.request,
      sortable: true,
      sortValue: (p) => p.id,
      cell: (p) => (
        <CellTwoRow
          primary={
            <span className="text-muted-foreground font-mono">{p.id}</span>
          }
          secondary={showMerchantName ? merchantName(p.merchantId) : undefined}
        />
      ),
    },
    {
      id: "method",
      header: columnLabels.payout.method,
      sortable: true,
      sortValue: (p) => p.payoutMethod,
      cell: (p) => (
        <CellTwoRow primary={p.payoutMethod} secondary={p.payoutDetails} />
      ),
    },
    {
      id: "orders",
      header: columnLabels.payout.orders,
      align: "center",
      sortable: true,
      sortValue: (p) => p.orderIds.length,
      cell: (p) => (
        <CellContent className="tabular-nums">{p.orderIds.length}</CellContent>
      ),
    },
    {
      id: "requested",
      header: columnLabels.payout.requested,
      sortable: true,
      sortValue: (p) => p.requestedAt,
      cellClassName: "text-muted-foreground",
      cell: (p) =>
        formatDateTime(p.requestedAt, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
    },
    {
      id: "amount",
      header: columnLabels.payout.amount,
      align: "right",
      sortable: true,
      sortValue: (p) => p.amount,
      cell: (p) => (
        <CellContent className="font-semibold tabular-nums">
          {formatTk(p.amount)}
        </CellContent>
      ),
    },
    {
      id: "status",
      header: columnLabels.payout.status,
      sortable: true,
      sortValue: (p) => p.status,
      cell: (p) => (
        <div className="flex flex-col gap-1">
          <PayoutStatusBadge status={p.status} />
          {p.status === "REJECTED" && p.rejectReason ? (
            <CellContent className="text-destructive max-w-48">
              {p.rejectReason}
            </CellContent>
          ) : null}
          {p.status === "PAID" && p.paidAt ? (
            <CellContent className="text-chart-2">
              Paid{" "}
              {formatDateTime(p.paidAt, {
                day: "numeric",
                month: "short",
              })}
            </CellContent>
          ) : null}
        </div>
      ),
    },
  ]

  return columns
}
