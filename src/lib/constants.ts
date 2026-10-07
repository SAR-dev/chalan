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
  RiderVehicleType,
  Role,
  SupportStatus,
} from "@/lib/types"

// Re-export value arrays from the DB schema (single source of truth)
export {
  balanceTxStatuses as BALANCE_TX_STATUSES,
  balanceTxTypes as BALANCE_TX_TYPES,
  emailLogStatuses as EMAIL_LOG_STATUSES,
  merchantStatuses as MERCHANT_STATUSES,
  orderDeliveryTypes as ORDER_DELIVERY_TYPES,
  orderStatuses as ORDER_STATUSES,
  packagePurchaseStatuses as PACKAGE_PURCHASE_STATUSES,
  packageRuleTypes as PACKAGE_RULE_TYPES,
  payoutRequestStatuses as PAYOUT_REQUEST_STATUSES,
  profileRoles as PROFILE_ROLES,
  riderStatuses as RIDER_STATUSES,
  riderTaskTypes as RIDER_TASK_TYPES,
  riderVehicleTypes as RIDER_VEHICLE_TYPES,
  supportStatuses as SUPPORT_STATUSES,
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

/**
 * The statuses an admin (or super admin) may cancel an order from — everything
 * up to, but not including, `OUT_FOR_DELIVERY`.
 *
 * One definition because there were previously six copies of this exact array:
 * the server guard, the order detail view, and four places across the admin and
 * warehouse order tables. Six copies means six places to forget when a status
 * is added between two existing ones, which is precisely how a parcel that
 * nobody had collected yet became un-cancellable while the parcel that *had*
 * been collected stayed cancellable.
 *
 * `merchantAllowed` in `transitions.ts` is deliberately separate: a merchant's
 * window is narrower ("before they are picked up") than the admin's.
 */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "OUT_FOR_PICKUP",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  OUT_FOR_PICKUP: "Out for pickup",
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
  // `brand` is the one tone no other status claims — APPROVED reads "waiting"
  // and PICKED_UP reads "collected", so the leg between them needed its own.
  OUT_FOR_PICKUP: "brand",
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

export const RIDER_VEHICLE_TYPE_LABELS: Record<RiderVehicleType, string> = {
  FOOT: "On foot",
  BICYCLE: "Bicycle",
  BIKE: "Motorbike",
  CAR: "Car",
  VAN: "Van",
  PICKUP_TRUCK: "Pickup truck",
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
  ORDER_CHARGE_REVERSAL: "Order Charge Reversal",
  ORDER_EARNINGS: "Order Earnings",
  ORDER_CANCELLATION: "Order Cancellation",
  PAYOUT: "Payout",
  PAYMENT_PENDING: "Payment Pending",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  ADJUSTMENT: "Adjustment",
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

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: "Open",
  ANSWERED: "Answered",
  CLOSED: "Closed",
}

export const SUPPORT_STATUS_TONES: Record<SupportStatus, BadgeTone> = {
  OPEN: "pending",
  ANSWERED: "info",
  CLOSED: "neutral",
}

export type UserAccountStatus = "ACTIVE" | "BANNED" | "INACTIVE"

export const USER_STATUS_LABELS: Record<UserAccountStatus, string> = {
  ACTIVE: "Active",
  BANNED: "Banned",
  INACTIVE: "Inactive",
}

export const USER_STATUS_TONES: Record<UserAccountStatus, BadgeTone> = {
  ACTIVE: "success",
  BANNED: "danger",
  INACTIVE: "neutral",
}

// ---------------------------------------------------------------------------
// Parcel labels (R5)
//
// The label template is a JSON array of typed blocks (see `LabelBlock` in
// `src/lib/validation.ts`). Every option is an enum or a clamped number — never
// free pixels — so the designer can compose a label but cannot produce one the
// renderer can't lay out or a scanner can't read. `LABEL_FIELD_KEYS` is a
// whitelist of order fields and site-identity values (see `src/config/site.ts`).
// The one genuinely free-form input is a `text` block, and even it is length-
// clamped; it is the escape hatch for a sender note or a "fragile" label.
// ---------------------------------------------------------------------------

/**
 * Values a `field` block may render — order fields plus the platform's own
 * identity (brand name, website). Whitelist, never free text.
 */
export const LABEL_FIELD_KEYS = [
  "orderId",
  "recipientName",
  "recipientPhone",
  "recipientAddress",
  "merchantName",
  "destinationCity",
  "weight",
  "codAmount",
  "siteName",
  "siteUrl",
] as const
export type LabelFieldKey = (typeof LABEL_FIELD_KEYS)[number]

/** Human labels for the designer's field picker. */
export const LABEL_FIELD_LABELS: Record<LabelFieldKey, string> = {
  orderId: "Order reference",
  recipientName: "Recipient name",
  recipientPhone: "Recipient phone",
  recipientAddress: "Delivery address",
  merchantName: "Merchant",
  destinationCity: "Destination city",
  weight: "Weight",
  codAmount: "COD amount",
  siteName: "Brand name",
  siteUrl: "Website URL",
}

/** Font-size steps a `field` block may use, plus the `bold` toggle. */
export const LABEL_FONT_SCALES = ["xs", "s", "m", "l", "xl"] as const
export type LabelFontScale = (typeof LABEL_FONT_SCALES)[number]

/** Block widths the renderer understands. */
export const LABEL_BLOCK_WIDTHS = ["full", "half"] as const
export type LabelBlockWidth = (typeof LABEL_BLOCK_WIDTHS)[number]

/** Physical size clamp for the single template, in millimetres. */
export const LABEL_TEMPLATE_MIN_MM = 20
export const LABEL_TEMPLATE_MAX_MM = 400

/** Default thermal parcel label — the one template, scaled to other paper. */
export const LABEL_DEFAULT_WIDTH_MM = 100
export const LABEL_DEFAULT_HEIGHT_MM = 150

/**
 * The QR code's minimum printed edge, in millimetres.
 *
 * Enforced by the renderer, not the admin: a QR smaller than this is the
 * failure R9 exists to avoid. `minSizeMm` on a `qr` block may be larger, never
 * smaller.
 */
export const LABEL_QR_MIN_MM = 30

/** Guardrails for a hand-wavy block stack. */
export const LABEL_MAX_BLOCKS = 40
export const LABEL_SPACER_MAX_MM = 40
export const LABEL_NAME_MAX = 80

/** Longest custom text a `text` block may carry, in characters. */
export const LABEL_TEXT_MAX = 200
export const LABEL_TEXT_DEFAULT = "Handle with care"

/** Brand-icon (`icon` block) printed height, in millimetres. */
export const LABEL_ICON_MIN_MM = 4
export const LABEL_ICON_DEFAULT_MM = 12
