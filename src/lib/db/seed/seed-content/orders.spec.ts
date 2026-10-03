import { describe, expect, it } from "vitest"
import { SEED_DELIVERY_CITIES } from "@/lib/db/seed/seed-content/delivery-cities"
import { SEED_ORDERS } from "@/lib/db/seed/seed-content/orders"
import { SEED_WAREHOUSES } from "@/lib/db/seed/seed-content/warehouses"

/**
 * The seed's order ↔ destination-city linkage.
 *
 * `orderCreateSchema` requires `deliveryCityId`, but the seed built orders
 * without one and named cities in the address from a private list of strings
 * that had no relationship to the `delivery_city` table — four of which
 * ("Gazipur", "Narayanganj", "Comilla", "Bogra") matched no row at all, and one
 * of the rest ("Chattogram") was a misspelling of a real one. Every seeded
 * order therefore landed with a null destination, which quietly switched off
 * everything downstream of it: lane pricing, the Destination column, and the
 * rider run sheet's zone grouping.
 *
 * These assertions are cheap and would all have caught it.
 */

const cityById = new Map(SEED_DELIVERY_CITIES.map((c) => [c.id, c]))
const cityNames = new Set(SEED_DELIVERY_CITIES.map((c) => c.name))

describe("seeded orders name a real delivery city", () => {
  it("gives every order a deliveryCityId that exists", () => {
    const dangling = SEED_ORDERS.filter((o) => !cityById.has(o.deliveryCityId))
    expect(dangling.map((o) => o.id)).toEqual([])
  })

  it("never leaves an order without a destination", () => {
    // `orderCreateSchema` rejects a missing city, so a seeded order without one
    // is a state the app itself cannot produce.
    expect(SEED_ORDERS.every((o) => typeof o.deliveryCityId === "string")).toBe(
      true,
    )
    expect(SEED_ORDERS.every((o) => o.deliveryCityId.length > 0)).toBe(true)
  })

  it("addresses each order to the city it points at", () => {
    // The address carries the city name as text. If the two ever disagree the
    // UI shows one city in the Destination column and a different one in the
    // address, and neither is obviously the bug.
    const mismatched = SEED_ORDERS.filter(
      (o) => !o.deliveryAddress.includes(cityById.get(o.deliveryCityId)!.name),
    )
    expect(mismatched.map((o) => o.id)).toEqual([])
  })

  it("never names a city that has no row", () => {
    // The trailing segment of a seeded address is its city. Anything after the
    // last comma that is not a known city name is a leftover from the old
    // hand-typed list.
    const orphans = SEED_ORDERS.map((o) =>
      o.deliveryAddress.slice(o.deliveryAddress.lastIndexOf(",") + 1).trim(),
    ).filter((name) => !cityNames.has(name))
    expect([...new Set(orphans)]).toEqual([])
  })

  it("spans more than one zone so zone-driven features are exercised", () => {
    // One destination zone would make lane pricing, the Destination column and
    // the run sheet's grouping all look like they work while proving nothing.
    const zones = new Set(
      SEED_ORDERS.map((o) => cityById.get(o.deliveryCityId)!.zoneId),
    )
    expect(zones.size).toBeGreaterThan(1)
  })

  it("keeps destination ids and names unique", () => {
    // `delivery_city.name` is UNIQUE in the schema; a duplicate here would fail
    // the insert rather than the test that explains why.
    expect(new Set(SEED_DELIVERY_CITIES.map((c) => c.id)).size).toBe(
      SEED_DELIVERY_CITIES.length,
    )
    expect(new Set(SEED_DELIVERY_CITIES.map((c) => c.name)).size).toBe(
      SEED_DELIVERY_CITIES.length,
    )
  })
})

describe("warehouse origin zones resolve", () => {
  it("matches every hub's city to a delivery_city row", () => {
    // `resolveRoutePricing` derives a hub's origin zone by joining
    // `warehouse.city` to `delivery_city.name` — an exact string match. A hub
    // whose city is misspelled or absent gets no origin zone and can price no
    // lane at all, which is why the second warehouse carries a comment saying
    // the same thing.
    const unresolved = SEED_WAREHOUSES.filter(
      (w) => !cityNames.has(w.city),
    ).map((w) => `${w.id}: ${w.city}`)
    expect(unresolved).toEqual([])
  })
})
