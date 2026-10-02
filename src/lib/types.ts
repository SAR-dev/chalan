import type {
  announcement,
  auditLog,
  balanceTransaction,
  deliveryCity,
  deliveryZone,
  emailLog,
  merchant,
  merchantBalance,
  order,
  packagePurchaseRequest,
  payoutRequest,
  pickupLocation,
  pricingPackageTier,
  profile,
  rider,
  supportTicket,
  user,
  warehouse,
  zonePricing,
} from "@/lib/db/schema"

// =============================================================================
// All domain types below are *derived* from the Drizzle schema (lib/db/schema.ts)
// instead of hand-duplicated here. This is the single source of truth: add a
// column to a table and every type that uses it (mock data, context state,
// components) is updated automatically by the compiler — no more drift
// between what the DB actually stores and what the app thinks it stores.
// =============================================================================

// Drizzle's $inferSelect marks a nullable column as `T | null` but keeps the
// key required, since a real `SELECT *` always returns the column (with a
// possibly-null value). For in-memory/app-state objects that's noisier than
// we want (mock seed data and optimistic updates routinely omit columns that
// are simply null), so this utility makes any column whose type includes
// `null` optional too, while leaving every other column's shape untouched.
type NullableKeys<T> = {
  [K in keyof T]: null extends T[K] ? K : never
}[keyof T]
type Loosen<T> = Omit<T, NullableKeys<T>> & Partial<Pick<T, NullableKeys<T>>>

// --- Literal unions, derived from the schema's `enum`-hinted columns -------
// (see schema.ts: these are still plain `text` columns in Postgres — the
// `enum` option is a Drizzle/TypeScript-only hint, not a runtime check.)
export type Role = (typeof profile.$inferSelect)["role"]
export type MerchantStatus = (typeof merchant.$inferSelect)["status"]
export type MerchantBusinessType = NonNullable<
  (typeof merchant.$inferSelect)["businessType"]
>
export type DeliveryType = (typeof order.$inferSelect)["deliveryType"]
export type OrderStatus = (typeof order.$inferSelect)["status"]
export type PayoutRequestStatus = (typeof payoutRequest.$inferSelect)["status"]
export type RiderTaskType = (typeof rider.$inferSelect)["taskType"]
export type RiderVehicleType = NonNullable<
  (typeof rider.$inferSelect)["vehicleType"]
>
export type RiderStatus = (typeof rider.$inferSelect)["status"]
export type BalanceTxType = (typeof balanceTransaction.$inferSelect)["type"]
export type BalanceTxStatus = (typeof balanceTransaction.$inferSelect)["status"]
export type PackageRuleType =
  (typeof pricingPackageTier.$inferSelect)["ruleType"]
export type PackagePurchaseStatus =
  (typeof packagePurchaseRequest.$inferSelect)["status"]
export type SupportStatus = (typeof supportTicket.$inferSelect)["status"]

// --- User: Better Auth's `user` row joined 1:1 with our `profile` row ------
// `userId` is just profile's PK/FK back to user.id, and profile.createdAt
// mirrors user.createdAt, so both are dropped from the profile side to avoid
// duplicate/conflicting keys.
// Activation tokens are server-only credentials — deliberately omitted so
// the client-facing User type never claims them.
type JoinedUser = Omit<
  typeof user.$inferSelect,
  "activationToken" | "activationTokenExpiresAt"
> &
  Omit<typeof profile.$inferSelect, "userId" | "createdAt"> & {
    // Optional per-user password — only set on self-registered users (seeded
    // demo users authenticate with the shared demo passwords below). Not a
    // DB column: Better Auth's own `account` table owns real credentials.
    password?: string
    // Merchant-specific: email verification timestamp from the merchant table.
    // Only populated for MERCHANT role via /api/users/me.
    emailVerifiedAt?: string | null
    // Global "admins must enroll in 2FA" flag (platform_config), surfaced by
    // /api/users/me so the shells can enforce it. Not a user column.
    twoFactorRequired?: boolean
    // Portal-mode gate: false when this role is outside the
    // deployment's PORTAL_MODE. Surfaced by /api/users/me so the client can
    // explain and sign the user out instead of hitting opaque 401s. Not a
    // user column.
    portalAllowed?: boolean
    // Staff-account activation: true while a moderator or
    // warehouse-admin invite is still PENDING (never activated). Surfaced by
    // /api/users/me so the login page shows the "check your email" panel.
    // Computed from isActive + activatedAt — not a user column.
    pendingActivation?: boolean
  }

export type User = Loosen<JoinedUser>

// Team roster list item. The team API and dashboard page project a narrow flat
// row (id, name, email, role, phone, isActive, warehouseId) — NOT a full
// joined `User`. This type is the honest shape of that projection so callers
// don't have to cast the joined `User` (which requires extra fields like
// createdAt / updatedAt that the projection never selects).
export type TeamMember = Pick<
  User,
  "id" | "name" | "email" | "role" | "phone" | "isActive" | "warehouseId"
> & {
  /** Lifecycle status: PENDING = created by an admin, activation link not
   *  yet clicked (warehouse-admin invites). */
  status: "ACTIVE" | "PENDING" | "DEACTIVATED"
}

export type Warehouse = Loosen<typeof warehouse.$inferSelect>
// `balance` is not a column on the merchant table — it comes from a LEFT JOIN
// with merchant_balance in the list endpoint. It is optional so the type stays
// compatible with rows that haven't been joined (e.g. the single-merchant fetch
// in the merchant's own hook, which skips the join).
export type Merchant = Loosen<typeof merchant.$inferSelect> & {
  balance?: number | null
  pendingBalance?: number | null
}
export type PickupLocation = Loosen<typeof pickupLocation.$inferSelect>
export type Rider = Loosen<typeof rider.$inferSelect>
export type Order = Loosen<typeof order.$inferSelect> & {
  deliveryCity?: string | null
  merchantPhone?: string | null
  pickupLocationMapLink?: string | null
  deliveryMapLink?: string | null
}
export type PayoutRequest = Loosen<typeof payoutRequest.$inferSelect>
export type SupportTicket = Loosen<typeof supportTicket.$inferSelect>
export type EmailLog = Loosen<typeof emailLog.$inferSelect>
// The list endpoint omits the HTML/plain-text bodies (they dominate the payload
// and are only needed by the detail view), so list rows are a projection.
export type EmailLogListItem = Omit<EmailLog, "body" | "textBody">
export type AuditLog = Loosen<typeof auditLog.$inferSelect>
export type MerchantBalance = Loosen<typeof merchantBalance.$inferSelect>
export type BalanceTransaction = Loosen<typeof balanceTransaction.$inferSelect>

export type { balanceTxStatuses, balanceTxTypes } from "@/lib/db/schema"

export type EmailLogStatus = (typeof emailLog.$inferSelect)["status"]

// =============================================================================
// App-only input shapes — request payloads, not DB rows, so there's no table
// to derive these from.
// =============================================================================

export interface MerchantRegistrationInput {
  businessName: string
  ownerName: string
  email: string
  phone: string
  address: string
  businessType?: MerchantBusinessType
  password: string
}

/**
 * Platform settings, as returned by `GET /api/platform-config`.
 *
 * Rates are per-lane `zone_pricing` rows, so the only platform-level policy
 * here is the cancellation refund. `min`/`maxCodFeePercentage` are the
 * validation bounds an admin sets for a lane's COD percentage.
 */
export interface PlatformConfig {
  id: string
  minCodFeePercentage: number
  maxCodFeePercentage: number
  refundOnCancel: boolean
  updatedAt: string
}

/** The PATCH body for `PUT`/`PATCH /api/platform-config`. */
export interface PlatformConfigInput {
  refundOnCancel?: boolean
}

/** A lane that has no `zone_pricing` row and therefore cannot be ordered on. */
export interface MissingZonePair {
  fromZoneId: string
  fromZoneName: string
  toZoneId: string
  toZoneName: string
}

/** Response of `GET /api/admin/pricing-coverage`. */
export interface PricingCoverage {
  missing: MissingZonePair[]
  /** Origin zones × destination zones — the pairs that could need a rate. */
  reachablePairCount: number
  configuredPairCount: number
  originZoneCount: number
  destinationZoneCount: number
}

export interface CreateOrderInput {
  pickupLocationId: string
  recipientName: string
  recipientPhone: string
  deliveryAddress: string
  deliveryCityId: string
  deliveryMapLink?: string | null
  parcelWeightKg: number
  /** What is in the parcel, in the merchant's words. Optional and never priced. */
  itemType?: string | null
  deliveryType: DeliveryType
  productCost: number
  merchantNote?: string | null
}

export type Announcement = Loosen<typeof announcement.$inferSelect>
export type DeliveryCity = typeof deliveryCity.$inferSelect
export type DeliveryZone = typeof deliveryZone.$inferSelect
export type ZonePricing = typeof zonePricing.$inferSelect

// --- Analytics types ---------------------------------------------------------

export interface OrdersByDay {
  date: string
  count: number
  revenue: number
}

export interface OrdersByStatus {
  status: string
  count: number
}

export interface DeliveryPerformance {
  totalDelivered: number
  totalFailed: number
  totalReturned: number
  successRate: number
  avgDeliveryTimeHours: number
}

export interface CodSummary {
  totalCollected: number
  totalSettled: number
  pendingSettlement: number
  settledCount: number
  pendingCount: number
}

export interface OrderAnalytics {
  ordersByDay: OrdersByDay[]
  ordersByStatus: OrdersByStatus[]
  deliveryPerformance: DeliveryPerformance
  codSummary: CodSummary
}

/**
 * Headline figures for the merchant overview, aggregated over the merchant's
 * Entire order history.
 *
 * Deliberately server-computed: deriving these client-side from the array
 * `useOrders()` returns meant every figure covered only the first
 * `DEFAULT_TABLE_ROWS_PER_PAGE` rows, which read as authoritative and was
 * wrong for any merchant with more than one page of orders.
 */
export interface MerchantOrderSummary {
  /** Sum of `productCost` over orders still carrying COD. */
  codToCollect: number
  inProgressCount: number
  codToSettleCount: number
  codToSettleAmount: number
  payoutReadyCount: number
  payoutToIssue: number
  deliveredCount: number
  totalEarnings: number
}
