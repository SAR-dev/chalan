import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import {
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
    // Optional client-supplied idempotency key (ROADMAP B13) — a retried create
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
    deliveryAddress: text("deliveryAddress").notNull(),
    deliveryCityId: text("deliveryCityId").references(() => deliveryCity.id, {
      onDelete: "set null",
    }),
    // Optional map link (e.g. Google Maps URL) the merchant can share to pinpoint
    // the recipient location.
    deliveryMapLink: text("deliveryMapLink"),
    parcelWeightKg: doublePrecision("parcelWeightKg").notNull(),
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

    // Pickup rider collects parcel from merchant.
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
    // A merchant cannot reuse an idempotency key (ROADMAP B13); NULL keys are
    // distinct, so orders without a key are unconstrained.
    uniqueIndex("order_idempotency_uniq").on(t.merchantId, t.idempotencyKey),
    index("order_cod_settled_at_idx").on(t.codSettledAt),
    index("order_payout_request_id_idx").on(t.payoutRequestId),
    index("order_merchant_package_id_idx").on(t.merchantPackageId),
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
  ],
)

// =============================================================================
// Order status history (ROADMAP P1.4)
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
