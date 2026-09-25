import { sql } from "drizzle-orm"
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import {
  orderDeliveryTypes,
  orderStatuses,
  payoutRequestStatuses,
} from "./enums"
import { ts } from "./helpers"
import { deliveryCity } from "./logistics"
import { merchant, pickupLocation } from "./merchants"
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
    amount: doublePrecision("amount").notNull(),
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
    index("payout_request_merchant_id_idx").on(t.merchantId),
    index("payout_request_status_idx").on(t.status),
    index("payout_request_requested_at_idx").on(t.requestedAt),
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
    productCost: doublePrecision("productCost").notNull(),
    deliveryFee: doublePrecision("deliveryFee").notNull(),
    codFee: doublePrecision("codFee").notNull().default(0),
    merchantEarnings: doublePrecision("merchantEarnings").notNull().default(0),

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
    amountCollected: doublePrecision("amountCollected"),
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
    // Role-scoped list queries (most common access pattern)
    index("order_merchant_id_idx").on(t.merchantId),
    index("order_warehouse_id_idx").on(t.warehouseId),
    index("order_delivery_city_id_idx").on(t.deliveryCityId),
    index("order_pickup_rider_id_idx").on(t.pickupRiderId),
    index("order_delivery_rider_id_idx").on(t.deliveryRiderId),
    index("order_pickup_location_id_idx").on(t.pickupLocationId),
    // Status filtering and sorting (used on every list page)
    index("order_status_idx").on(t.status),
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
    index("order_status_created_at_idx").on(t.status, t.createdAt),
    index("order_cod_settled_at_idx").on(t.codSettledAt),
    index("order_payout_request_id_idx").on(t.payoutRequestId),
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
