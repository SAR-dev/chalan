import { createId } from "@paralleldrive/cuid2"
import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import { ts } from "./helpers"
import { warehouse } from "./warehouses"

// =============================================================================
// Delivery cities
//
// Admin-managed list of cities merchants can select when creating orders.
// Each city belongs to a zone (for pricing) and routes to a warehouse.
// =============================================================================

export const deliveryCity = pgTable(
  "delivery_city",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull().unique(),
    zoneId: text("zoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "restrict" }),
    warehouseId: text("warehouseId")
      .notNull()
      .references(() => warehouse.id, { onDelete: "restrict" }),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("delivery_city_zone_id_idx").on(t.zoneId),
    index("delivery_city_warehouse_id_idx").on(t.warehouseId),
  ],
)

// =============================================================================
// Delivery zones
//
// Groups of cities that share the same delivery pricing. Admin creates zones
// and assigns cities to them. Zone-to-zone pricing is in zone_pricing.
// =============================================================================

export const deliveryZone = pgTable("delivery_zone", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull().unique(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt").notNull().defaultNow(),
})

// =============================================================================
// Zone-to-zone pricing
//
// N×N matrix: one row per (fromZone, toZone) pair. Determines delivery fee
// based on origin zone (warehouse's city) and destination zone (order's city).
// =============================================================================

export const zonePricing = pgTable(
  "zone_pricing",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    fromZoneId: text("fromZoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "cascade" }),
    toZoneId: text("toZoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "cascade" }),
    baseRate: doublePrecision("baseRate").notNull().default(0),
    extraRatePerKg: doublePrecision("extraRatePerKg").notNull().default(0),
    freeWeightKg: doublePrecision("freeWeightKg").notNull().default(1),
    maxWeightKg: doublePrecision("maxWeightKg").notNull().default(10),
    codFeePercentage: doublePrecision("codFeePercentage").notNull().default(1),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("zone_pricing_from_idx").on(t.fromZoneId),
    index("zone_pricing_to_idx").on(t.toZoneId),
  ],
)
