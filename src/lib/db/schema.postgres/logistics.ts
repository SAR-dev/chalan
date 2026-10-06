import { createId } from "@paralleldrive/cuid2"
import {
  boolean,
  doublePrecision,
  index,
  integer,
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
    // `restrict`, not `cascade`: a rate card is money owed to a merchant, and a
    // single future `delete(zone)` would otherwise erase both endpoints of a
    // lane silently — leaving orders that quoted a fee nobody can reproduce.
    // No route deletes a zone today, so this changes no behaviour; it makes the
    // mistake impossible rather than merely absent. The explicit delete path is
    // `DELETE /api/admin/delivery-zones/:id`, which must clear pricing first.
    fromZoneId: text("fromZoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "restrict" }),
    toZoneId: text("toZoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "restrict" }),
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
    // The matrix is keyed by the zone pair. Without this, two
    // concurrent upserts could each insert a row for the same pair and order
    // pricing would silently pick an arbitrary one of them.
    uniqueIndex("zone_pricing_pair_uniq").on(t.fromZoneId, t.toZoneId),
  ],
)

// =============================================================================
// Zone-to-zone delivery time
//
// N×N matrix, keyed exactly like `zone_pricing`, but measuring days rather than
// money.
//
// Deliberately a separate table rather than columns on `zone_pricing`: the two
// have independent lifecycles. A lane can carry a rate with no delivery time
// configured — that yields *no estimate* and does not block an order, because
// pricing blocks on an unconfigured lane for a different reason (money is
// owed) while a missing delivery date is a display gap.
//
// It is config, not history: an order snapshots the number it was quoted
// (`order.expectedDeliveryDays`) at creation, so editing this row later cannot
// move an existing parcel's promised date. That is the same rule
// `zone_pricing` already follows with `order.deliveryFee`.
// =============================================================================

export const zoneDeliveryTime = pgTable(
  "zone_delivery_time",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    fromZoneId: text("fromZoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "restrict" }),
    toZoneId: text("toZoneId")
      .notNull()
      .references(() => deliveryZone.id, { onDelete: "restrict" }),
    // Same `restrict` reasoning as `zone_pricing`, and for a sharper reason: a
    // cascaded delete of a zone would erase a lane's delivery time and silently
    // strip every future order on it of its promise, with nothing in the app to
    // explain why dates stopped appearing.
    //
    // Whole days from order creation to delivery. An integer rather than a
    // doublePrecision: this counts days, it is not a measurement.
    deliveryDays: integer("deliveryDays").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("zone_delivery_time_from_idx").on(t.fromZoneId),
    index("zone_delivery_time_to_idx").on(t.toZoneId),
    // Same reasoning as `zone_pricing_pair_uniq`: the matrix is keyed by the
    // pair, so two concurrent upserts must not leave an arbitrary row winning.
    uniqueIndex("zone_delivery_time_pair_uniq").on(t.fromZoneId, t.toZoneId),
  ],
)
