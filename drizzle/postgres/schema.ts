import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

export const account = pgTable(
  "account",
  {
    id: text().primaryKey().notNull(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true, mode: "string" }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true, mode: "string" }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "account_userId_user_id_fk",
    }).onDelete("cascade"),
  ],
)

export const warehouse = pgTable(
  "warehouse",
  {
    id: text().primaryKey().notNull(),
    name: text().notNull(),
    address: text().notNull(),
    city: text().notNull(),
    managedBy: text(),
    isActive: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("warehouse_address_trgm_idx").using(
      "gin",
      table.address.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("warehouse_city_trgm_idx").using(
      "gin",
      table.city.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("warehouse_name_trgm_idx").using(
      "gin",
      table.name.asc().nullsLast().op("gin_trgm_ops"),
    ),
  ],
)

export const session = pgTable(
  "session",
  {
    id: text().primaryKey().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    token: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull(),
  },
  (table) => [
    index("session_expires_at_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("session_user_id_idx").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "session_userId_user_id_fk",
    }).onDelete("cascade"),
    unique("session_token_unique").on(table.token),
  ],
)

export const failedMail = pgTable("failed_mail", {
  id: text().primaryKey().notNull(),
  to: text().notNull(),
  subject: text().notNull(),
  html: text(),
  text: text(),
  error: text().notNull(),
  attempts: integer().notNull(),
  failedAt: timestamp({ withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  createdAt: timestamp({ withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
})

export const order = pgTable(
  "order",
  {
    id: text().primaryKey().notNull(),
    code: text().notNull(),
    merchantId: text().notNull(),
    pickupLocationId: text().notNull(),
    recipientName: text().notNull(),
    recipientPhone: text().notNull(),
    deliveryAddress: text().notNull(),
    deliveryCity: text().notNull(),
    deliveryMapLink: text(),
    deliveryImageLinks: text().array(),
    parcelWeightKg: doublePrecision().notNull(),
    deliveryType: text().default("STANDARD").notNull(),
    productCost: doublePrecision().notNull(),
    deliveryCharge: doublePrecision().notNull(),
    securityMoney: doublePrecision().notNull(),
    status: text().default("PENDING").notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    approvedBy: text(),
    approvedAt: timestamp({ withTimezone: true, mode: "string" }),
    pickupRiderId: text(),
    assignedAt: timestamp({ withTimezone: true, mode: "string" }),
    pickedUpAt: timestamp({ withTimezone: true, mode: "string" }),
    pickupProofRefs: text().array(),
    warehouseId: text().notNull(),
    receivedAtWarehouseAt: timestamp({ withTimezone: true, mode: "string" }),
    receivedByWarehouse: text(),
    deliveryRiderId: text(),
    dispatchedAt: timestamp({ withTimezone: true, mode: "string" }),
    dispatchedBy: text(),
    outForDeliveryAt: timestamp({ withTimezone: true, mode: "string" }),
    deliveredAt: timestamp({ withTimezone: true, mode: "string" }),
    deliveryProofRef: text(),
    amountCollected: doublePrecision(),
    failedAttemptAt: timestamp({ withTimezone: true, mode: "string" }),
    failureNote: text(),
    deliveryAttempts: integer().default(0).notNull(),
    failedResolvedAt: timestamp({ withTimezone: true, mode: "string" }),
    failedResolvedBy: text(),
    returnedAt: timestamp({ withTimezone: true, mode: "string" }),
    returnReason: text(),
    cancelledAt: timestamp({ withTimezone: true, mode: "string" }),
    cancelledBy: text(),
    cancelReason: text(),
    merchantNote: text(),
    receiverNote: text(),
    codSettledAt: timestamp({ withTimezone: true, mode: "string" }),
    codSettledBy: text(),
    payoutRequestId: text(),
  },
  (table) => [
    index("order_cod_settled_at_idx").using(
      "btree",
      table.codSettledAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("order_code_trgm_idx").using(
      "gin",
      table.code.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("order_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("order_delivery_city_trgm_idx").using(
      "gin",
      table.deliveryCity.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("order_delivery_rider_id_idx").using(
      "btree",
      table.deliveryRiderId.asc().nullsLast().op("text_ops"),
    ),
    index("order_merchant_id_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
    ),
    index("order_merchant_status_created_at_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
      table.status.asc().nullsLast().op("text_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("order_merchant_status_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
      table.status.asc().nullsLast().op("text_ops"),
    ),
    index("order_payout_request_id_idx").using(
      "btree",
      table.payoutRequestId.asc().nullsLast().op("text_ops"),
    ),
    index("order_pickup_rider_id_idx").using(
      "btree",
      table.pickupRiderId.asc().nullsLast().op("text_ops"),
    ),
    index("order_recipient_name_trgm_idx").using(
      "gin",
      table.recipientName.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("order_recipient_phone_trgm_idx").using(
      "gin",
      table.recipientPhone.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("order_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    index("order_warehouse_id_idx").using(
      "btree",
      table.warehouseId.asc().nullsLast().op("text_ops"),
    ),
    index("order_warehouse_status_created_at_idx").using(
      "btree",
      table.warehouseId.asc().nullsLast().op("timestamptz_ops"),
      table.status.asc().nullsLast().op("text_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("order_warehouse_status_idx").using(
      "btree",
      table.warehouseId.asc().nullsLast().op("text_ops"),
      table.status.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchant.id],
      name: "order_merchantId_merchant_id_fk",
    }),
    foreignKey({
      columns: [table.pickupLocationId],
      foreignColumns: [pickupLocation.id],
      name: "order_pickupLocationId_pickup_location_id_fk",
    }),
    foreignKey({
      columns: [table.pickupRiderId],
      foreignColumns: [rider.id],
      name: "order_pickupRiderId_rider_id_fk",
    }),
    foreignKey({
      columns: [table.warehouseId],
      foreignColumns: [warehouse.id],
      name: "order_warehouseId_warehouse_id_fk",
    }),
    foreignKey({
      columns: [table.deliveryRiderId],
      foreignColumns: [rider.id],
      name: "order_deliveryRiderId_rider_id_fk",
    }),
    foreignKey({
      columns: [table.payoutRequestId],
      foreignColumns: [payoutRequest.id],
      name: "order_payoutRequestId_payout_request_id_fk",
    }),
    unique("order_code_unique").on(table.code),
  ],
)

export const user = pgTable(
  "user",
  {
    id: text().primaryKey().notNull(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    role: text(),
    banned: boolean(),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("user_email_trgm_idx").using(
      "gin",
      table.email.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("user_name_trgm_idx").using(
      "gin",
      table.name.asc().nullsLast().op("gin_trgm_ops"),
    ),
    unique("user_email_unique").on(table.email),
  ],
)

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey().notNull(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" }).defaultNow(),
  },
  (table) => [
    index("verification_identifier_idx").using(
      "btree",
      table.identifier.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const securityConfig = pgTable("security_config", {
  id: text().primaryKey().notNull(),
  lowValueThreshold: doublePrecision().default(1000).notNull(),
  lowValueFlatFee: doublePrecision().default(10).notNull(),
  highValuePercentage: doublePrecision().default(1).notNull(),
  updatedAt: timestamp({ withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  updatedBy: text().notNull(),
})

export const pickupLocation = pgTable(
  "pickup_location",
  {
    id: text().primaryKey().notNull(),
    merchantId: text().notNull(),
    label: text().notNull(),
    address: text().notNull(),
    warehouseId: text().notNull(),
    mapLink: text(),
    imageLinks: text().array(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("pickup_location_merchant_id_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchant.id],
      name: "pickup_location_merchantId_merchant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.warehouseId],
      foreignColumns: [warehouse.id],
      name: "pickup_location_warehouseId_warehouse_id_fk",
    }).onDelete("restrict"),
  ],
)

export const rider = pgTable(
  "rider",
  {
    id: text().primaryKey().notNull(),
    name: text().notNull(),
    phone: text().notNull(),
    zone: text().notNull(),
    isActive: boolean().default(true).notNull(),
    taskType: text().default("DELIVERY").notNull(),
    warehouseId: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rider_is_active_idx").using(
      "btree",
      table.isActive.asc().nullsLast().op("bool_ops"),
    ),
    index("rider_name_trgm_idx").using(
      "gin",
      table.name.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("rider_phone_trgm_idx").using(
      "gin",
      table.phone.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("rider_task_type_idx").using(
      "btree",
      table.taskType.asc().nullsLast().op("text_ops"),
    ),
    index("rider_warehouse_id_idx").using(
      "btree",
      table.warehouseId.asc().nullsLast().op("text_ops"),
    ),
    index("rider_zone_trgm_idx").using(
      "gin",
      table.zone.asc().nullsLast().op("gin_trgm_ops"),
    ),
    foreignKey({
      columns: [table.warehouseId],
      foreignColumns: [warehouse.id],
      name: "rider_warehouseId_warehouse_id_fk",
    }).onDelete("restrict"),
  ],
)

export const auditLog = pgTable(
  "audit_log",
  {
    id: text().primaryKey().notNull(),
    actorId: text(),
    actorName: text().notNull(),
    actorRole: text().notNull(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    description: text().notNull(),
    metadata: jsonb(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_log_action_trgm_idx").using(
      "gin",
      table.action.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("audit_log_actor_id_idx").using(
      "btree",
      table.actorId.asc().nullsLast().op("text_ops"),
    ),
    index("audit_log_actor_name_trgm_idx").using(
      "gin",
      table.actorName.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("audit_log_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("audit_log_description_trgm_idx").using(
      "gin",
      table.description.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("audit_log_entity_id_idx").using(
      "btree",
      table.entityId.asc().nullsLast().op("text_ops"),
    ),
    index("audit_log_entity_type_id_idx").using(
      "btree",
      table.entityType.asc().nullsLast().op("text_ops"),
      table.entityId.asc().nullsLast().op("text_ops"),
    ),
    index("audit_log_entity_type_idx").using(
      "btree",
      table.entityType.asc().nullsLast().op("text_ops"),
    ),
    index("audit_log_entity_type_trgm_idx").using(
      "gin",
      table.entityType.asc().nullsLast().op("gin_trgm_ops"),
    ),
  ],
)

export const emailLog = pgTable(
  "email_log",
  {
    id: text().primaryKey().notNull(),
    to: text().notNull(),
    subject: text().notNull(),
    status: text().notNull(),
    attempts: integer().notNull(),
    error: text(),
    body: text(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    markedSentBy: text(),
    markedSentAt: timestamp({ withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("email_log_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("email_log_error_trgm_idx").using(
      "gin",
      table.error.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("email_log_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    index("email_log_subject_trgm_idx").using(
      "gin",
      table.subject.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("email_log_to_trgm_idx").using(
      "gin",
      table.to.asc().nullsLast().op("gin_trgm_ops"),
    ),
  ],
)

export const merchant = pgTable(
  "merchant",
  {
    id: text().primaryKey().notNull(),
    businessName: text().notNull(),
    ownerName: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    address: text().notNull(),
    status: text().default("PENDING").notNull(),
    baseRate: doublePrecision().default(0).notNull(),
    extraRatePerKg: doublePrecision().default(0).notNull(),
    maxWeightKg: doublePrecision().default(3).notNull(),
    freeWeightKg: doublePrecision().default(1).notNull(),
    approvedBy: text(),
    approvedAt: timestamp({ withTimezone: true, mode: "string" }),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("merchant_business_name_trgm_idx").using(
      "gin",
      table.businessName.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("merchant_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("merchant_email_trgm_idx").using(
      "gin",
      table.email.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("merchant_owner_name_trgm_idx").using(
      "gin",
      table.ownerName.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("merchant_phone_trgm_idx").using(
      "gin",
      table.phone.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("merchant_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
  ],
)

export const payoutRequest = pgTable(
  "payout_request",
  {
    id: text().primaryKey().notNull(),
    code: text().notNull(),
    merchantId: text().notNull(),
    orderIds: jsonb().notNull(),
    amount: doublePrecision().notNull(),
    status: text().default("PENDING").notNull(),
    payoutMethod: text().notNull(),
    payoutDetails: text().notNull(),
    requestedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    reviewedBy: text(),
    reviewedAt: timestamp({ withTimezone: true, mode: "string" }),
    rejectReason: text(),
    paidAt: timestamp({ withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("payout_request_code_trgm_idx").using(
      "gin",
      table.code.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("payout_request_merchant_id_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
    ),
    index("payout_request_order_ids_idx").using(
      "gin",
      table.orderIds.asc().nullsLast().op("jsonb_ops"),
    ),
    index("payout_request_requested_at_idx").using(
      "btree",
      table.requestedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("payout_request_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchant.id],
      name: "payout_request_merchantId_merchant_id_fk",
    }),
    unique("payout_request_code_unique").on(table.code),
  ],
)

export const profile = pgTable(
  "profile",
  {
    userId: text().primaryKey().notNull(),
    role: text().notNull(),
    phone: text().default("").notNull(),
    isActive: boolean().default(true).notNull(),
    canManagePricing: boolean().default(false).notNull(),
    tableRowsPerPage: integer().default(20).notNull(),
    warehouseId: text(),
    merchantId: text(),
    riderId: text(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("profile_merchant_id_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
    ),
    index("profile_phone_trgm_idx").using(
      "gin",
      table.phone.asc().nullsLast().op("gin_trgm_ops"),
    ),
    index("profile_rider_id_idx").using(
      "btree",
      table.riderId.asc().nullsLast().op("text_ops"),
    ),
    index("profile_role_idx").using(
      "btree",
      table.role.asc().nullsLast().op("text_ops"),
    ),
    index("profile_warehouse_id_idx").using(
      "btree",
      table.warehouseId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "profile_userId_user_id_fk",
    }).onDelete("cascade"),
  ],
)

export const merchantBalance = pgTable(
  "merchant_balance",
  {
    id: text().primaryKey().notNull(),
    merchantId: text().notNull(),
    balance: doublePrecision().default(0).notNull(),
    pendingBalance: doublePrecision().default(0).notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchant.id],
      name: "merchant_balance_merchantId_merchant_id_fk",
    }).onDelete("cascade"),
    unique("merchant_balance_merchantId_unique").on(table.merchantId),
  ],
)

export const announcement = pgTable(
  "announcement",
  {
    id: text().primaryKey().notNull(),
    title: text().notNull(),
    content: text().notNull(),
    publishedAt: timestamp({ withTimezone: true, mode: "string" }),
    expiresAt: timestamp({ withTimezone: true, mode: "string" }),
    isActive: boolean().default(true).notNull(),
    targetRoles: jsonb().notNull(),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("announcement_expires_at_idx").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("announcement_is_active_idx").using(
      "btree",
      table.isActive.asc().nullsLast().op("bool_ops"),
    ),
    index("announcement_published_at_idx").using(
      "btree",
      table.publishedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("announcement_target_roles_idx").using(
      "gin",
      table.targetRoles.asc().nullsLast().op("jsonb_ops"),
    ),
    index("announcement_title_trgm_idx").using(
      "gin",
      table.title.asc().nullsLast().op("gin_trgm_ops"),
    ),
  ],
)

export const balanceTransaction = pgTable(
  "balance_transaction",
  {
    id: text().primaryKey().notNull(),
    merchantId: text().notNull(),
    type: text().notNull(),
    amount: doublePrecision().notNull(),
    status: text().default("SETTLED").notNull(),
    note: text(),
    paymentMethod: text(),
    paymentAccount: text(),
    reviewedBy: text(),
    reviewedAt: timestamp({ withTimezone: true, mode: "string" }),
    rejectReason: text(),
    orderId: text(),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("balance_tx_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("balance_tx_merchant_id_idx").using(
      "btree",
      table.merchantId.asc().nullsLast().op("text_ops"),
    ),
    index("balance_tx_order_id_idx").using(
      "btree",
      table.orderId.asc().nullsLast().op("text_ops"),
    ),
    index("balance_tx_status_idx").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
    ),
    index("balance_tx_type_idx").using(
      "btree",
      table.type.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.merchantId],
      foreignColumns: [merchant.id],
      name: "balance_transaction_merchantId_merchant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [order.id],
      name: "balance_transaction_orderId_order_id_fk",
    }).onDelete("set null"),
  ],
)
