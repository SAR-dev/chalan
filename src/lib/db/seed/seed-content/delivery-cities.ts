import { WAREHOUSE_IDS } from "./warehouses"

// ---------------------------------------------------------------------------
// Deterministic: Delivery cities (8 rows)
//
// Lives here rather than in `seed/delivery-cities.ts` because two other seed
// modules need to refer to these rows by identity:
//
//   - `orders.ts` puts a `deliveryCityId` on every seeded order, and names the
//     city in the address. That used to be a separate hand-typed list of city
//     *names* ("Chattogram", "Gazipur", "Bogra", …) with no link to this table,
//     so every seeded order shipped with `deliveryCityId = null`. A null
//     destination is not a state the app can produce — `orderCreateSchema`
//     requires the field — but the seed bypassed validation, which left the
//     whole zone side of the product (lane pricing, the rider run sheet, the
//     Destination column) inert in every seeded environment.
//   - `warehouses.ts` needs to assert each hub's `city` matches a row here,
//     because `resolveRoutePricing` derives a hub's origin zone by joining
//     `warehouse.city` to `delivery_city.name` — an exact string match.
//
// One list, referenced by id, so a city cannot exist here while orders point
// somewhere that does not.
// ---------------------------------------------------------------------------

export interface DeliveryCitySeedEntry {
  id: string
  name: string
  /** `delivery_zone.id` — decides the pricing lane and the run sheet's grouping. */
  zoneId: string
  /** Which hub serves deliveries to this city. */
  warehouseId: string
}

// Zone ids, repeated here because `seed/delivery-zones.ts` owns the rows but
// this module must not import it: that module opens the database at import
// time, and `seed-content/**` is imported by unit tests that never touch one.
export const SEED_ZONE_IDS = {
  dhakaMetro: "DZ-100001E",
  divisionalCities: "DZ-100002E",
  remoteAreas: "DZ-100003E",
} as const

export const SEED_DELIVERY_CITIES: DeliveryCitySeedEntry[] = [
  {
    id: "DC-100001E",
    name: "Dhaka",
    zoneId: SEED_ZONE_IDS.dhakaMetro,
    warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
  },
  {
    id: "DC-100002E",
    name: "Chittagong",
    zoneId: SEED_ZONE_IDS.divisionalCities,
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100003E",
    name: "Sylhet",
    zoneId: SEED_ZONE_IDS.divisionalCities,
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100004E",
    name: "Rajshahi",
    zoneId: SEED_ZONE_IDS.divisionalCities,
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100005E",
    name: "Khulna",
    zoneId: SEED_ZONE_IDS.divisionalCities,
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100006E",
    name: "Barisal",
    zoneId: SEED_ZONE_IDS.remoteAreas,
    warehouseId: WAREHOUSE_IDS.sylhetRegionalDepot,
  },
  {
    id: "DC-100007E",
    name: "Rangpur",
    zoneId: SEED_ZONE_IDS.remoteAreas,
    warehouseId: WAREHOUSE_IDS.sylhetRegionalDepot,
  },
  {
    id: "DC-100008E",
    name: "Mymensingh",
    zoneId: SEED_ZONE_IDS.divisionalCities,
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
]
