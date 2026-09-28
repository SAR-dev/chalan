import { createId } from "@paralleldrive/cuid2"
import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { money, ts } from "./helpers"
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
    baseRate: money("baseRate").notNull().default(0),
    extraRatePerKg: money("extraRatePerKg").notNull().default(0),
    freeWeightKg: doublePrecision("freeWeightKg").notNull().default(1),
    maxWeightKg: doublePrecision("maxWeightKg").notNull().default(10),
    codFeePercentage: doublePrecision("codFeePercentage").notNull().default(1),
    // Charged (instead of the delivery fee) when an order on this zone pair is
    // returned to the merchant; the creation fee is refunded (see return
    // transition). Configured per city-pair alongside the delivery rates.
    cancellationFee: money("cancellationFee").notNull().default(0),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("zone_pricing_from_idx").on(t.fromZoneId),
    index("zone_pricing_to_idx").on(t.toZoneId),
    // P1.1: the matrix is keyed by the zone pair. Without this, two
    // concurrent upserts could each insert a row for the same pair and order
    // pricing would silently pick an arbitrary one of them.
    uniqueIndex("zone_pricing_pair_uniq").on(t.fromZoneId, t.toZoneId),
  ],
)
