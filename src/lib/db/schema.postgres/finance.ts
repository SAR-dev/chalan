import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { balanceTxStatuses, balanceTxTypes } from "./enums"
import { money, ts } from "./helpers"
import { merchant } from "./merchants"
import { order } from "./orders"

// =============================================================================
// Merchant balance
//
// One row per merchant. Holds the live running total of what the merchant
// owes the platform (deliveryCharge + COD fee accumulated across orders,
// minus confirmed payments). Positive = owes platform. Zero/negative = credit.
// Kept as a separate table (not a column on merchant) so it can be locked
// independently with `.for("update")` during payment confirmation.
// =============================================================================

export const merchantBalance = pgTable("merchant_balance", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  merchantId: text("merchantId")
    .notNull()
    .unique()
    .references(() => merchant.id, { onDelete: "cascade" }),
  balance: money("balance").notNull().default(0),
  pendingBalance: money("pendingBalance").notNull().default(0),
  updatedAt: ts("updatedAt").notNull().defaultNow(),
})

// =============================================================================
// Balance transactions
//
// Append-only ledger. One row per event that changes (or will change) a
// merchant's balance. Never update or delete rows here — every correction is
// itself a new ADJUSTMENT row so the full history is always auditable.
// =============================================================================

export const balanceTransaction = pgTable(
  "balance_transaction",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    type: text("type", { enum: balanceTxTypes }).notNull(),
    // Positive = charge / debit (merchant owes more).
    // Negative = payment / credit (merchant owes less).
    amount: money("amount").notNull(),
    status: text("status", { enum: balanceTxStatuses })
      .notNull()
      .default("SETTLED"),
    // Human-readable context: order code for ORDER_CHARGE, admin note for
    // ADJUSTMENT, optional reference for payment rows.
    note: text("note"),
    // Merchant-supplied payment details (only set for PAYMENT_PENDING rows).
    paymentMethod: text("paymentMethod"),
    paymentAccount: text("paymentAccount"),
    // Admin who rejected or confirmed a payment, or wrote an adjustment.
    reviewedBy: text("reviewedBy"),
    reviewedAt: ts("reviewedAt"),
    rejectReason: text("rejectReason"),
    // Soft FK to the order that triggered an ORDER_CHARGE row.
    orderId: text("orderId").references(() => order.id, {
      onDelete: "set null",
    }),
    // Name of the actor who created this row (matches the approvedBy pattern).
    createdBy: text("createdBy").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("balance_tx_status_idx").on(t.status),
    index("balance_tx_type_idx").on(t.type),
    index("balance_tx_order_id_idx").on(t.orderId),
    index("balance_tx_created_at_idx").on(t.createdAt),
    index("balance_tx_merchant_id_created_at_idx").on(
      t.merchantId,
      t.createdAt,
    ),
    // A merchant may have at most ONE payment awaiting confirmation.
    // The route used to check-then-insert outside a transaction, so two
    // double-clicks could both pass the check and both reserve `pendingBalance`.
    // This index is the hard guarantee; the route only turns the violation
    // into a friendly 409.
    uniqueIndex("balance_tx_one_pending_payment_uniq")
      .on(t.merchantId)
      .where(sql`${t.type} = 'PAYMENT_PENDING' and ${t.status} = 'PENDING'`),
  ],
)
