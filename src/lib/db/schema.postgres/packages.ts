import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { packagePurchaseStatuses, packageRuleTypes } from "./enums"
import { money, ts } from "./helpers"
import { merchant } from "./merchants"

// =============================================================================
// Pricing packages (a.k.a. prepaid "bundles")
//
// A package is a purchasable plan. Its tiers award a delivery-fee discount
// once the merchant has shipped at least `orderCount` orders *within the
// active bundle*. The merchant's wallet is the existing merchant_balance —
// packages do not get their own balance.
// =============================================================================

export const pricingPackage = pgTable(
  "pricing_package",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    price: money("price").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    createdBy: text("createdBy"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("pricing_package_is_active_idx").on(t.isActive),
    index("pricing_package_name_trgm_idx").using(
      "gin",
      sql`${t.name} gin_trgm_ops`,
    ),
  ],
)

// =============================================================================
// Package tiers
//
// Ordered discount steps. `orderCount` is the cumulative number of orders the
// merchant must have shipped to unlock the tier; `ruleType` says how the
// delivery fee is adjusted (`FLAT` → fixed override, `PERCENT_OFF` →
// percentage discount). Tiers are validated in the API layer (strictly
// increasing counts, PERCENT_OFF value in 0-100).
// =============================================================================

export const pricingPackageTier = pgTable(
  "pricing_package_tier",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    packageId: text("packageId")
      .notNull()
      .references(() => pricingPackage.id, { onDelete: "cascade" }),
    sortOrder: integer("sortOrder").notNull().default(0),
    orderCount: integer("orderCount").notNull(),
    ruleType: text("ruleType", { enum: packageRuleTypes }).notNull(),
    // FLAT = fixed delivery charge (Tk); PERCENT_OFF = discount percent.
    // Kept as double precision — it is a rule parameter, not a ledger amount.
    ruleValue: doublePrecision("ruleValue").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("pricing_package_tier_package_id_idx").on(t.packageId),
    uniqueIndex("pricing_package_tier_package_order_uniq").on(
      t.packageId,
      t.orderCount,
    ),
    uniqueIndex("pricing_package_tier_package_sort_uniq").on(
      t.packageId,
      t.sortOrder,
    ),
  ],
)

// =============================================================================
// Merchant packages (an activated bundle)
//
// One active bundle per merchant at a time (partial unique index). `ordersUsed`
// drains as orders are created and is refunded on cancel/return. The order row
// snapshots the merchantPackageId so a later reassignment never changes what an
// existing order was charged.
// =============================================================================

export const merchantPackage = pgTable(
  "merchant_package",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    packageId: text("packageId")
      .notNull()
      .references(() => pricingPackage.id, { onDelete: "restrict" }),
    ordersUsed: integer("ordersUsed").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    assignedBy: text("assignedBy"),
    startedAt: ts("startedAt").notNull().defaultNow(),
    endedAt: ts("endedAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("merchant_package_merchant_id_idx").on(t.merchantId),
    index("merchant_package_package_id_idx").on(t.packageId),
    // At most one active bundle per merchant (mirrors the one-pending-payment
    // guarantee in finance.ts).
    uniqueIndex("merchant_package_one_active_uniq")
      .on(t.merchantId)
      .where(sql`${t.isActive} = true`),
  ],
)

// =============================================================================
// Package purchase requests
//
// A merchant requests a package, transfers the money manually, and an admin
// confirms. Only the request/approval is persisted here — the bundle itself is
// a merchant_package row created on approval.
// =============================================================================

export const packagePurchaseRequest = pgTable(
  "package_purchase_request",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    packageId: text("packageId")
      .notNull()
      .references(() => pricingPackage.id, { onDelete: "restrict" }),
    // Price snapshotted at request time. Editing pricing_package.price later must
    // not change what an already-requested purchase is worth.
    amount: money("amount").notNull(),
    status: text("status", { enum: packagePurchaseStatuses })
      .notNull()
      .default("PENDING"),
    note: text("note"),
    requestedAt: ts("requestedAt").notNull().defaultNow(),
    reviewedBy: text("reviewedBy"),
    reviewedAt: ts("reviewedAt"),
    rejectReason: text("rejectReason"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("package_purchase_request_merchant_id_idx").on(t.merchantId),
    index("package_purchase_request_status_idx").on(t.status),
    // A merchant may have at most ONE request awaiting review.
    uniqueIndex("package_purchase_request_one_pending_uniq")
      .on(t.merchantId)
      .where(sql`${t.status} = 'PENDING'`),
  ],
)
