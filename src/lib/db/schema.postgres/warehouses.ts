import { sql } from "drizzle-orm"
import { boolean, index, pgTable, text } from "drizzle-orm/pg-core"
import { riderStatuses, riderTaskTypes } from "./enums"
import { ts } from "./helpers"

// =============================================================================
// Warehouses
// =============================================================================

export const warehouse = pgTable(
  "warehouse",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('WH', nextval('warehouse_id_seq'))`),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    managedBy: text("managedBy"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("warehouse_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("warehouse_address_trgm_idx").using(
      "gin",
      sql`${t.address} gin_trgm_ops`,
    ),
    index("warehouse_city_trgm_idx").using("gin", sql`${t.city} gin_trgm_ops`),
  ],
)

// =============================================================================
// Riders (standalone entity — not tightly coupled to a user row)
// =============================================================================

export const rider = pgTable(
  "rider",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('RID', nextval('rider_id_seq'))`),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull(),
    // Service zone the rider primarily covers.
    zone: text("zone").notNull(),
    address: text("address").notNull().default(""),
    nidNumber: text("nidNumber").notNull().default(""),
    status: text("status", { enum: riderStatuses }).notNull().default("ACTIVE"),
    isActive: boolean("isActive").notNull().default(true),
    // What the rider is allowed to do, independent of their home warehouse.
    taskType: text("taskType", { enum: riderTaskTypes })
      .notNull()
      .default("DELIVERY"),
    // Home warehouse this rider dispatches from. Every rider belongs to exactly
    // one warehouse. `restrict` prevents deleting a hub that still has riders.
    warehouseId: text("warehouseId")
      .notNull()
      .references(() => warehouse.id, { onDelete: "restrict" }),
    // Approval trail — set when an admin reviews a PENDING application.
    approvedBy: text("approvedBy"),
    approvedAt: ts("approvedAt"),
    rejectionReason: text("rejectionReason"),
    // NID verification — rider uploads front/back/selfie images for admin review.
    nidFrontImage: text("nidFrontImage"),
    nidBackImage: text("nidBackImage"),
    nidSelfieImage: text("nidSelfieImage"),
    nidSubmittedAt: ts("nidSubmittedAt"),
    nidVerifiedAt: ts("nidVerifiedAt"),
    nidVerifiedBy: text("nidVerifiedBy"),
    nidRejectedAt: ts("nidRejectedAt"),
    nidRejectedBy: text("nidRejectedBy"),
    nidRejectionReason: text("nidRejectionReason"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("rider_warehouse_id_idx").on(t.warehouseId),
    index("rider_task_type_idx").on(t.taskType),
    index("rider_is_active_idx").on(t.isActive),
    index("rider_status_idx").on(t.status),
    index("rider_created_at_idx").on(t.createdAt),
    index("rider_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("rider_phone_trgm_idx").using("gin", sql`${t.phone} gin_trgm_ops`),
    index("rider_zone_trgm_idx").using("gin", sql`${t.zone} gin_trgm_ops`),
    index("rider_email_trgm_idx").using("gin", sql`${t.email} gin_trgm_ops`),
  ],
)
