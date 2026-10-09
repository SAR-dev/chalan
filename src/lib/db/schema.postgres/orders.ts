import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  orderDeliveryTypes,
  orderStatuses,
  packageRuleTypes,
  payoutRequestStatuses,
} from "./enums"
import { money, ts } from "./helpers"
import { deliveryCity } from "./logistics"
import { merchant, pickupLocation } from "./merchants"
import { merchantPackage, pricingPackage, pricingPackageTier } from "./packages"
import { rider, warehouse } from "./warehouses"

// =============================================================================
// Payout requests
// =============================================================================

export const payoutRequest = pgTable(
  "payout_request",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('PR', nextval('payout_request_id_seq'))`),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id),
    // Order IDs bundled into this payout request, stored as jsonb. The
    // .$type<string[]>() call tells Drizzle the inferred type without altering
    // the column — no manual JSON.stringify / JSON.parse is needed at runtime.
    orderIds: jsonb("orderIds").$type<string[]>().notNull(),
    amount: money("amount").notNull(),
    status: text("status", { enum: payoutRequestStatuses })
      .notNull()
      .default("PENDING"),
    // Merchant-supplied payout destination.
    payoutMethod: text("payoutMethod").notNull(),
    payoutDetails: text("payoutDetails").notNull(),
    requestedAt: ts("requestedAt").notNull().defaultNow(),
    // Super Admin review stamps.
    reviewedBy: text("reviewedBy"),
    reviewedAt: ts("reviewedAt"),
    rejectReason: text("rejectReason"),
    paidAt: ts("paidAt"),
  },
  (t) => [
    index("payout_request_status_idx").on(t.status),
    index("payout_request_requested_at_idx").on(t.requestedAt),
    // Leading merchantId also covers the plain merchant lookup.
    index("payout_request_merchant_requested_at_idx").on(
      t.merchantId,
      t.requestedAt,
    ),
    index("payout_request_merchant_id_status_idx").on(t.merchantId, t.status),
    index("payout_request_code_trgm_idx").using(
      "gin",
      sql`${t.id} gin_trgm_ops`,
    ),
  ],
)

// =============================================================================
// Orders
//
// All lifecycle timestamps are embedded directly on the order row rather than
// in a separate audit log table. Fields are null until their stage is reached.
//
// ── On the CHECK constraints below ───────────────────────────────────────────
//
// `order.status` is deliberately *not* a PostgreSQL enum, and deliberately has
// no `status IN (…)` CHECK. That omission is the design, not an oversight: a
// new status then needs no DDL at all beyond whatever columns it adds. Adding
// `OUT_FOR_PICKUP` cost one `ALTER TABLE ADD COLUMN` and nothing else — no
// `ALTER TYPE … ADD VALUE`, no table rewrite, no migration-ordering problem. A
// whitelist would cost a migration per future status to enforce a rule the
// transition guards already enforce.
//
// The constraints that *do* exist are therefore **conditional**: each one names
// a specific status, and adding a new status cannot invalidate any of them, so
// their cost stays at zero per status while incoherent rows become impossible.
// A constraint that had to be edited whenever a status was added would not be
// worth having.
//
// Deliberately absent: business rules. The transition guards in
// `src/features/orders/transitions.ts` read the session and call
// `resolveRoutePricing`; they belong in the application, and the database
// trusts the app as the only process allowed to write `order`.
//
// Baseline before these were added: 111 orders, 0 violations of all twelve
// (`pnpm db:audit-invariants`, see DBREFACTOR.md Phase A). Each one is proved to
// reject a bad row in `src/lib/db/integration.spec.ts`.
// =============================================================================

export const order = pgTable(
  "order",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('ORD', nextval('order_id_seq'))`),
    // High-entropy public identifier used by the tracking page URL and to
    // authorize the public receiver-note write. The sequential `id` stays the
    // human/parcel code; the token is the secret that grants write access.
    trackingToken: text("trackingToken"),
    // Optional client-supplied idempotency key — a retried create
    // returns the original order instead of charging twice.
    idempotencyKey: text("idempotencyKey"),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id),
    pickupLocationId: text("pickupLocationId")
      .notNull()
      .references(() => pickupLocation.id),
    recipientName: text("recipientName").notNull(),
    recipientPhone: text("recipientPhone").notNull(),
    // Recipient's email — deliberately **nullable**, never NOT NULL. Orders
    // created before this column existed, bulk rows that omit it, and merchants
    // who simply never collect an address all have to keep working: a NOT NULL
    // here would fail every one of them, which is the lesson
    // `profile.announcementsSeenAt` already taught (that column's nullability is
    // pinned by an integration spec for the same reason).
    //
    // Personal data: only the owning merchant and staff may read it, and it
    // never appears on the public track page.
    recipientMail: text("recipientMail"),
    deliveryAddress: text("deliveryAddress").notNull(),
    deliveryCityId: text("deliveryCityId").references(() => deliveryCity.id, {
      onDelete: "set null",
    }),
    // Optional map link (e.g. Google Maps URL) the merchant can share to pinpoint
    // the recipient location.
    deliveryMapLink: text("deliveryMapLink"),
    parcelWeightKg: doublePrecision("parcelWeightKg").notNull(),
    // What is in the parcel, in the merchant's own words ("saree", "phone
    // charger", "cooked food"). Free text on purpose: the list of things people
    // actually sell is unbounded, and a fixed enum would either be too short to
    // be useful or so long that nobody picks carefully. It is descriptive and
    // never touches pricing — a parcel's cost comes from its lane and weight,
    // so nothing here can change what an order is charged.
    // Nullable because orders created before this column existed have none.
    itemType: text("itemType"),
    deliveryType: text("deliveryType", { enum: orderDeliveryTypes })
      .notNull()
      .default("STANDARD"),
    productCost: money("productCost").notNull(),
    deliveryFee: money("deliveryFee").notNull(),
    codFee: money("codFee").notNull().default(0),
    // Snapshot of the zone-pair cancellation fee at creation. Charged (and the
    // delivery/COD fees refunded) if the parcel is returned to the merchant.
    cancellationFee: money("cancellationFee").notNull().default(0),
    merchantEarnings: money("merchantEarnings").notNull().default(0),

    // Package/bundle snapshot at creation. The rule is frozen here so later
    // reassignment or tier edits never change a past order's fee. FKs are
    // `set null` so deactivating a package keeps the order history readable.
    packageId: text("packageId").references(() => pricingPackage.id, {
      onDelete: "set null",
    }),
    packageTierId: text("packageTierId").references(
      () => pricingPackageTier.id,
      { onDelete: "set null" },
    ),
    merchantPackageId: text("merchantPackageId").references(
      () => merchantPackage.id,
      { onDelete: "set null" },
    ),
    packageRuleType: text("packageRuleType", { enum: packageRuleTypes }),
    packageRuleValue: doublePrecision("packageRuleValue"),

    status: text("status", { enum: orderStatuses })
      .notNull()
      .default("PENDING"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),

    // Admin approval and pickup rider assignment.
    approvedBy: text("approvedBy"),
    approvedAt: ts("approvedAt"),
    pickupRiderId: text("pickupRiderId").references(() => rider.id),
    assignedAt: ts("assignedAt"),

    // Pickup rider collects parcel from merchant. `outForPickupAt` mirrors
    // `outForDeliveryAt` on the delivery leg: the moment the rider declares they
    // are heading to the shop, and the gate before `pickedUpAt` can be set.
    outForPickupAt: ts("outForPickupAt"),
    pickedUpAt: ts("pickedUpAt"),
    // Photo(s) the pickup rider captures as proof of collection (shop front,
    // parcel in hand, etc). Multiple images allowed, same pattern as the
    // pickup-location reference photos above.
    pickupProofRefs: text("pickupProofRefs").array(),

    // Parcel received at warehouse.
    warehouseId: text("warehouseId")
      .notNull()
      .references(() => warehouse.id),
    receivedAtWarehouseAt: ts("receivedAtWarehouseAt"),
    // Name of the Warehouse Admin who logged the parcel in.
    receivedByWarehouse: text("receivedByWarehouse"),

    // Warehouse Admin assigns delivery rider and dispatches parcel.
    deliveryRiderId: text("deliveryRiderId").references(() => rider.id),
    dispatchedAt: ts("dispatchedAt"),
    // Name of the Warehouse Admin who dispatched.
    dispatchedBy: text("dispatchedBy"),

    // The delivery promise, and whether it was kept.
    //
    // Snapshotted at creation from `zone_delivery_time` (days from
    // `createdAt`), never recomputed — editing the zone matrix afterwards
    // must not move a promised date that a merchant has already seen. Null
    // when the lane has no configured delivery time: an estimate that is
    // missing is honest, one that changes is not. Admins and warehouse
    // admins may set a custom `expectedDeliveryAt` (see the
    // `set-expected-delivery` transition), which is recorded but not
    // derivable — hence the days staying as quoted alongside it.
    expectedDeliveryDays: integer("expectedDeliveryDays"),
    expectedDeliveryAt: ts("expectedDeliveryAt"),
    // Written once, by the `delivered` transition: whole days from `createdAt`
    // to `deliveredAt`. Null until delivered, so "late" can never be inferred
    // from a parcel that has not arrived.
    actualDeliveryDays: integer("actualDeliveryDays"),

    // Delivery rider heads out and attempts delivery.
    outForDeliveryAt: ts("outForDeliveryAt"),
    // Successful delivery.
    deliveredAt: ts("deliveredAt"),
    // Soft reference to uploaded proof image (URL / storage key).
    deliveryProofRef: text("deliveryProofRef"),
    amountCollected: money("amountCollected"),
    // Why less than the expected COD was collected (partial/refused payment).
    deliveryShortfallReason: text("deliveryShortfallReason"),
    // Failed attempt.
    failedAttemptAt: ts("failedAttemptAt"),
    failureNote: text("failureNote"),
    deliveryAttempts: integer("deliveryAttempts").notNull().default(0),

    // Warehouse Admin resolves a failed delivery attempt.
    failedResolvedAt: ts("failedResolvedAt"),
    // Name of the Warehouse Admin who resolved the exception.
    failedResolvedBy: text("failedResolvedBy"),
    // Set only when parcel is closed as RETURNED.
    returnedAt: ts("returnedAt"),
    returnReason: text("returnReason"),

    // Set when an order is cancelled (terminal).
    cancelledAt: ts("cancelledAt"),
    cancelledBy: text("cancelledBy"), // name of actor, matches approvedBy / dispatchedBy pattern
    cancelReason: text("cancelReason"), // optional free-text note

    // Notes — merchant can add a note at order creation; receiver (recipient)
    // can add a note via the tracking page before delivery.
    merchantNote: text("merchantNote"),
    receiverNote: text("receiverNote"),

    // COD settlement — rider hands cash to the Warehouse Admin.
    codSettledAt: ts("codSettledAt"),
    codSettledBy: text("codSettledBy"),
    // Payout request this order is attached to. Presence of this field (combined
    // with a non-REJECTED request status) locks the order so it cannot be
    // included in a second payout request.
    payoutRequestId: text("payoutRequestId").references(() => payoutRequest.id),
  },
  (t) => [
    // Role-scoped list queries (most common access pattern). The owner+createdAt
    // composites below also cover the plain owner lookups, so no single-column
    // owner index is needed.
    index("order_merchant_created_at_idx").on(t.merchantId, t.createdAt),
    index("order_warehouse_created_at_idx").on(t.warehouseId, t.createdAt),
    index("order_delivery_rider_created_at_idx").on(
      t.deliveryRiderId,
      t.createdAt,
    ),
    index("order_pickup_rider_created_at_idx").on(t.pickupRiderId, t.createdAt),
    index("order_delivery_city_id_idx").on(t.deliveryCityId),
    index("order_pickup_location_id_idx").on(t.pickupLocationId),
    index("order_created_at_idx").on(t.createdAt),
    // Composite covering indexes for common sorted list queries (warehouse admin, merchant, admin)
    index("order_warehouse_status_created_at_idx").on(
      t.warehouseId,
      t.status,
      t.createdAt,
    ),
    index("order_merchant_status_created_at_idx").on(
      t.merchantId,
      t.status,
      t.createdAt,
    ),
    // Also serves plain `WHERE status = …` (status is the leading column).
    index("order_status_created_at_idx").on(t.status, t.createdAt),
    // A merchant cannot reuse an idempotency key; NULL keys are
    // distinct, so orders without a key are unconstrained.
    uniqueIndex("order_idempotency_uniq").on(t.merchantId, t.idempotencyKey),
    index("order_cod_settled_at_idx").on(t.codSettledAt),
    index("order_payout_request_id_idx").on(t.payoutRequestId),
    index("order_merchant_package_id_idx").on(t.merchantPackageId),
    // Both FKs are `ON DELETE set null`, so Postgres must check `order` for
    // references on every package or tier delete — without an index that is a
    // sequential scan of the largest table in the database. Routine admin edits
    // (`DELETE /api/packages/:id`, `.../:tierId`) were paying it.
    index("order_package_id_idx").on(t.packageId),
    index("order_package_tier_id_idx").on(t.packageTierId),
    // Public tracking lookups resolve by token (and the token is unique).
    uniqueIndex("order_tracking_token_unique").on(t.trackingToken),
    index("order_code_trgm_idx").using("gin", sql`${t.id} gin_trgm_ops`),
    index("order_recipient_name_trgm_idx").using(
      "gin",
      sql`${t.recipientName} gin_trgm_ops`,
    ),
    index("order_recipient_phone_trgm_idx").using(
      "gin",
      sql`${t.recipientPhone} gin_trgm_ops`,
    ),

    // ── Conditional lifecycle pairings (DBREFACTOR Phase C) ──────────────────
    //
    // Each says: this status already happened, so the timestamp that records it
    // must exist. A row claiming DELIVERED with no `deliveredAt` is incoherent —
    // every SLA report, the COD settlement page and the tracking timeline all
    // read that column, so its absence silently becomes "delivered at the epoch".
    //
    // The constraint name is the error message Postgres surfaces
    // (`violates check constraint "order_delivered_needs_delivered_at"`), so
    // each one names the pairing it caught rather than being `check_1`.
    check(
      "order_delivered_needs_delivered_at",
      sql`${t.status} <> 'DELIVERED' OR ${t.deliveredAt} IS NOT NULL`,
    ),
    check(
      "order_cancelled_needs_cancelled_at",
      sql`${t.status} <> 'CANCELLED' OR ${t.cancelledAt} IS NOT NULL`,
    ),
    check(
      "order_returned_needs_returned_at",
      sql`${t.status} <> 'RETURNED' OR ${t.returnedAt} IS NOT NULL`,
    ),
    check(
      "order_picked_up_needs_picked_up_at",
      sql`${t.status} <> 'PICKED_UP' OR ${t.pickedUpAt} IS NOT NULL`,
    ),
    check(
      "order_out_for_pickup_needs_out_for_pickup_at",
      sql`${t.status} <> 'OUT_FOR_PICKUP' OR ${t.outForPickupAt} IS NOT NULL`,
    ),
    check(
      "order_out_for_delivery_needs_out_for_delivery_at",
      sql`${t.status} <> 'OUT_FOR_DELIVERY' OR ${t.outForDeliveryAt} IS NOT NULL`,
    ),

    // ── Money is never negative (DBREFACTOR Phase D) ─────────────────────────
    //
    // The four fee columns and the earnings snapshot are all `>= 0` by
    // construction in `resolveRoutePricing` and the transition guards; nothing
    // in the app can produce a negative one. That is exactly why a constraint
    // is safe here — it cannot fire, so it costs nothing to keep true, and it
    // turns a future pricing bug into a failed transaction rather than a
    // negative fee that quietly credits a merchant.
    //
    // `balance_transaction.amount` is NOT in this list and must never be: it is
    // signed by design, and 23 of 150 live rows are negative reversals.
    check("order_product_cost_nonneg", sql`${t.productCost} >= 0`),
    check("order_delivery_fee_nonneg", sql`${t.deliveryFee} >= 0`),
    check("order_cod_fee_nonneg", sql`${t.codFee} >= 0`),
    check("order_cancellation_fee_nonneg", sql`${t.cancellationFee} >= 0`),
    // `merchantEarnings` is signed on purpose: when fees exceed COD collected,
    // the merchant is net-negative; clamping to 0 would hide that debt from
    // payouts and reports. The ledger stores the true signed balance, so the
    // non-negative CHECK must not block legitimate negative-earnings orders.
    // `amountCollected` is nullable (null until a rider hands cash over), and a
    // CHECK that evaluates to NULL passes — but the `IS NULL` is written out
    // anyway so the next reader does not have to know that rule of three-valued
    // logic to trust this.
    check(
      "order_amount_collected_nonneg",
      sql`${t.amountCollected} IS NULL OR ${t.amountCollected} >= 0`,
    ),
  ],
)

// =============================================================================
// Order status history
//
// Append-only trail of every lifecycle transition. The order row keeps only
// the current status, so without this a `reattempt` erased the prior failure
// and a support question about "what happened to this parcel" had no answer.
// Rows are written inside the same transaction as the transition itself.
// =============================================================================

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orderId: text("orderId")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    fromStatus: text("fromStatus", { enum: orderStatuses }),
    toStatus: text("toStatus", { enum: orderStatuses }).notNull(),
    transition: text("transition").notNull(),
    actorId: text("actorId"),
    actorName: text("actorName"),
    actorRole: text("actorRole"),
    // Free-text reason carried by the transition (failure note, return/cancel
    // reason), so the trail is self-contained.
    note: text("note"),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("order_status_history_order_id_created_at_idx").on(
      t.orderId,
      t.createdAt,
    ),
  ],
)
