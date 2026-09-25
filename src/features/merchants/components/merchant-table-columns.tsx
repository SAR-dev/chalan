import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail,
  MailCheck,
  Phone,
} from "lucide-react"
import { CellTwoRow, type DataTableColumn } from "@/components/data-table"
import { columnLabels } from "@/config/table-column-labels"
import { MerchantStatusBadge } from "@/features/merchants/components/merchant-status-badge"
import { formatTk } from "@/lib/pricing"
import type { Merchant } from "@/lib/types"

export function merchantBusinessColumn(): DataTableColumn<Merchant> {
  return {
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
  }
}

export function merchantOwnerColumn(): DataTableColumn<Merchant> {
  return {
    id: "owner",
    header: columnLabels.merchant.owner,
    sortable: true,
    sortValue: (m) => m.ownerName,
    cell: (m) => <CellTwoRow primary={m.ownerName} secondary={m.phone} />,
  }
}

export function merchantStatusColumn(): DataTableColumn<Merchant> {
  return {
    id: "status",
    header: columnLabels.merchant.status,
    sortable: true,
    sortValue: (m) => m.status,
    cell: (m) => <MerchantStatusBadge status={m.status} />,
  }
}

export function merchantEmailVerifiedColumn(): DataTableColumn<Merchant> {
  return {
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
  }
}

export function merchantPhoneVerifiedColumn(): DataTableColumn<Merchant> {
  return {
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
  }
}

export function merchantNidVerifiedColumn(): DataTableColumn<Merchant> {
  return {
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
  }
}

export function merchantBaseRateColumn(): DataTableColumn<Merchant> {
  return {
    id: "baseRate",
    header: columnLabels.merchant.baseRate,
    align: "right",
    sortable: true,
    sortValue: (m) => m.baseRate,
    cell: (m) => {
      const needsRate = m.status === "ACTIVE" && m.baseRate <= 0
      return needsRate ? (
        <span className="text-chart-3 inline-flex items-center gap-1">
          <AlertTriangle className="size-4" />
          <span className="tabular-nums">{formatTk(m.baseRate)}</span>
        </span>
      ) : (
        <span className="tabular-nums">{formatTk(m.baseRate)}</span>
      )
    },
  }
}

export function merchantPerKgColumn(): DataTableColumn<Merchant> {
  return {
    id: "perKg",
    header: columnLabels.merchant.perKg,
    align: "right",
    sortable: true,
    sortValue: (m) => m.extraRatePerKg,
    cell: (m) => (
      <span className="tabular-nums">{formatTk(m.extraRatePerKg)}</span>
    ),
  }
}

export function merchantPendingBalanceColumn(): DataTableColumn<Merchant> {
  return {
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
  }
}

export function merchantBalanceColumn(): DataTableColumn<Merchant> {
  return {
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
  }
}
