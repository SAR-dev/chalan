import type { warehouse } from "@/lib/db/schema"

// ---------------------------------------------------------------------------
// Explicit: Warehouses (logistics hubs)
// ---------------------------------------------------------------------------
export const SEED_WAREHOUSES: (typeof warehouse.$inferInsert)[] = [
  {
    id: "WH-100001E",
    name: "Dhaka Central Hub",
    address: "Plot 22, Tejgaon Industrial Area",
    city: "Dhaka",
    managedBy: null,
    isActive: true,
  },
  {
    id: "WH-100002E",
    name: "Chattogram Port Hub",
    address: "Agrabad Commercial Area, Block C",
    // MUST equal a `delivery_city.name` exactly. The origin zone of every order
    // out of this warehouse is resolved by joining `warehouse.city` to
    // `delivery_city.name`, and the seeded delivery city is "Chittagong" — a
    // spelling mismatch here leaves the hub with no zone and makes it unable to
    // price any lane (see `resolveRoutePricing`).
    city: "Chittagong",
    managedBy: null,
    isActive: true,
  },
  {
    id: "WH-100003E",
    name: "Sylhet Regional Depot",
    address: "Zindabazar Main Road",
    city: "Sylhet",
    managedBy: null,
    isActive: false,
  },
]

// ---------------------------------------------------------------------------
// Stable warehouse IDs — referenced by riders, orders, etc.
// ---------------------------------------------------------------------------
export const WAREHOUSE_IDS = {
  dhakaCentralHub: "WH-100001E",
  chattogramPortHub: "WH-100002E",
  sylhetRegionalDepot: "WH-100003E",
} as const
