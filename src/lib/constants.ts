import { siteConfig } from "@/config/site"
import type {
  BalanceTxStatus,
  BalanceTxType,
  DeliveryType,
  EmailLogStatus,
  MerchantStatus,
  OrderStatus,
  PayoutRequestStatus,
  RiderStatus,
  RiderTaskType,
  Role,
} from "@/lib/types"

// Re-export value arrays from the DB schema (single source of truth)
export {
  balanceTxStatuses as BALANCE_TX_STATUSES,
  balanceTxTypes as BALANCE_TX_TYPES,
  emailLogStatuses as EMAIL_LOG_STATUSES,
  merchantStatuses as MERCHANT_STATUSES,
  orderDeliveryTypes as ORDER_DELIVERY_TYPES,
  orderStatuses as ORDER_STATUSES,
  payoutRequestStatuses as PAYOUT_REQUEST_STATUSES,
  profileRoles as PROFILE_ROLES,
  riderStatuses as RIDER_STATUSES,
  riderTaskTypes as RIDER_TASK_TYPES,
} from "@/lib/db/schema"

export const BRAND_NAME = siteConfig.name
export const CURRENCY_SUFFIX = "TK"
export const MAX_BULK_ORDERS = 50

export const DEFAULT_TABLE_ROWS_PER_PAGE = 20
export const MAX_TABLE_ROWS_PER_PAGE = 250

export const BADGE_TONES = {
  pending: "bg-chart-3/15 text-chart-3 border-chart-3/25",
  info: "bg-chart-1/15 text-chart-1 border-chart-1/25",
  success:
    "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/25",
  transit:
    "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25",
  warehouse: "bg-accent text-accent-foreground border-accent-foreground/20",
  neutral: "bg-muted text-muted-foreground border-border",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  brand: "bg-primary/10 text-primary border-primary/20",
  violet:
    "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25",
  slate:
    "bg-slate-800 text-slate-100 border-slate-600 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-400",
} as const

export type BadgeTone = keyof typeof BADGE_TONES

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PICKED_UP: "Picked up",
  IN_WAREHOUSE: "In warehouse",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED_ATTEMPT: "Failed attempt",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
}

export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  PENDING: "pending",
  APPROVED: "info",
  PICKED_UP: "violet",
  IN_WAREHOUSE: "warehouse",
  IN_TRANSIT: "rose",
  OUT_FOR_DELIVERY: "transit",
  DELIVERED: "success",
  FAILED_ATTEMPT: "danger",
  RETURNED: "neutral",
  CANCELLED: "slate",
}

export const MERCHANT_STATUS_LABELS: Record<MerchantStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
}

export const MERCHANT_STATUS_TONES: Record<MerchantStatus, BadgeTone> = {
  PENDING: "pending",
  ACTIVE: "success",
  SUSPENDED: "danger",
}

export const PAYOUT_STATUS_LABELS: Record<PayoutRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PAID: "Paid",
  REJECTED: "Rejected",
}

export const PAYOUT_STATUS_TONES: Record<PayoutRequestStatus, BadgeTone> = {
  PENDING: "pending",
  APPROVED: "info",
  PAID: "success",
  REJECTED: "danger",
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  WAREHOUSE_ADMIN: "Warehouse Admin",
  MERCHANT: "Merchant",
  RIDER: "Rider",
}

export const ROLE_TONES: Record<Role, BadgeTone> = {
  SUPER_ADMIN: "brand",
  WAREHOUSE_ADMIN: "warehouse",
  MERCHANT: "neutral",
  RIDER: "neutral",
}

export const EMAIL_LOG_STATUS_LABELS: Record<EmailLogStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
}

export const EMAIL_LOG_STATUS_TONES: Record<EmailLogStatus, BadgeTone> = {
  SENT: "success",
  FAILED: "danger",
}

export const ANNOUNCEMENT_TARGET_ROLE_LABELS = ROLE_LABELS as Record<
  string,
  string
>

export const ORDER_DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  STANDARD: "Standard",
  FRAGILE: "Fragile",
}

export const ORDER_DELIVERY_TYPE_TONES: Record<DeliveryType, BadgeTone> = {
  STANDARD: "neutral",
  FRAGILE: "info",
}

export const RIDER_TASK_TYPE_LABELS: Record<RiderTaskType, string> = {
  PICKUP: "Pickup",
  DELIVERY: "Delivery",
  BOTH: "Both",
}

export const RIDER_TASK_TYPE_TONES: Record<RiderTaskType, BadgeTone> = {
  PICKUP: "info",
  DELIVERY: "success",
  BOTH: "brand",
}

export const RIDER_STATUS_LABELS: Record<RiderStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
}

export const RIDER_STATUS_TONES: Record<RiderStatus, BadgeTone> = {
  PENDING: "pending",
  APPROVED: "info",
  REJECTED: "danger",
  ACTIVE: "success",
  SUSPENDED: "danger",
}

export const BALANCE_TX_TYPE_LABELS: Record<BalanceTxType, string> = {
  ORDER_CHARGE: "Order Charge",
  ORDER_EARNINGS: "Order Earnings",
  PAYOUT: "Payout",
  PAYMENT_PENDING: "Payment Pending",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  ADJUSTMENT: "Adjustment",
}

export const BALANCE_TX_TYPE_TONES: Record<BalanceTxType, BadgeTone> = {
  ORDER_CHARGE: "danger",
  ORDER_EARNINGS: "success",
  PAYOUT: "info",
  PAYMENT_PENDING: "pending",
  PAYMENT_CONFIRMED: "success",
  ADJUSTMENT: "neutral",
}

export const BALANCE_TX_STATUS_LABELS: Record<BalanceTxStatus, string> = {
  SETTLED: "Settled",
  PENDING: "Pending",
  REJECTED: "Rejected",
}

export const BALANCE_TX_STATUS_TONES: Record<BalanceTxStatus, BadgeTone> = {
  SETTLED: "success",
  PENDING: "pending",
  REJECTED: "danger",
}
