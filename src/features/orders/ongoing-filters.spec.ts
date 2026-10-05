import { describe, expect, it } from "vitest"
import { makeOrder } from "@/app/__tests__/test-utils"
import {
  ANY_CITY,
  ANY_RIDER,
  filterOngoingOrders,
  isFiltering,
  NO_ONGOING_FILTERS,
  type OngoingFilters,
} from "./ongoing-filters"

function filters(overrides: Partial<OngoingFilters> = {}): OngoingFilters {
  return { ...NO_ONGOING_FILTERS, ...overrides }
}

describe("filterOngoingOrders", () => {
  const board = [
    makeOrder({ id: "ORD-1", status: "PICKED_UP", pickupRiderId: "rider_1" }),
    makeOrder({
      id: "ORD-2",
      status: "IN_TRANSIT",
      deliveryRiderId: "rider_2",
      pickupCityId: "dc_2",
      deliveryCityId: "dc_1",
    }),
    makeOrder({
      id: "ORD-3",
      status: "IN_WAREHOUSE",
      deliveryRiderId: null,
      pickupCityId: "dc_1",
      deliveryCityId: "dc_3",
    }),
  ]

  it("returns the same array untouched when nothing is set", () => {
    // Identity, not just equality: no filter means no work, and the board's
    // grouping memo can keep its previous result.
    expect(filterOngoingOrders(board, filters())).toBe(board)
  })

  it("matches the order id on any substring, ignoring case", () => {
    expect(
      filterOngoingOrders(board, filters({ query: "rd-2" })).map((o) => o.id),
    ).toEqual(["ORD-2"])
    expect(
      filterOngoingOrders(board, filters({ query: "  ORD-3  " })).map(
        (o) => o.id,
      ),
    ).toEqual(["ORD-3"])
    expect(filterOngoingOrders(board, filters({ query: "ORD" }))).toHaveLength(
      3,
    )
    expect(filterOngoingOrders(board, filters({ query: "nope" }))).toEqual([])
  })

  it("filters the rider by whoever holds the parcel's next leg", () => {
    // ORD-1 is collected by rider_1, ORD-2 delivered by rider_2. Filtering on
    // rider_1 must not surface ORD-2 just because rider_2 also has an id.
    expect(
      filterOngoingOrders(board, filters({ riderId: "rider_1" })).map(
        (o) => o.id,
      ),
    ).toEqual(["ORD-1"])
    expect(
      filterOngoingOrders(board, filters({ riderId: "rider_2" })).map(
        (o) => o.id,
      ),
    ).toEqual(["ORD-2"])
  })

  it("has no rider option for an unassigned parcel", () => {
    // ORD-3 sits in the warehouse with nobody on it; it matches only when the
    // rider filter is off, never a specific rider.
    expect(
      filterOngoingOrders(board, filters({ riderId: "rider_2" })),
    ).not.toContainEqual(expect.objectContaining({ id: "ORD-3" }))
    expect(filterOngoingOrders(board, filters())).toContainEqual(
      expect.objectContaining({ id: "ORD-3" }),
    )
  })

  it("filters pickup city and delivery city separately", () => {
    expect(
      filterOngoingOrders(board, filters({ pickupCityId: "dc_2" })).map(
        (o) => o.id,
      ),
    ).toEqual(["ORD-2"])
    expect(
      filterOngoingOrders(board, filters({ deliveryCityId: "dc_3" })).map(
        (o) => o.id,
      ),
    ).toEqual(["ORD-3"])
  })

  it("combines every filter with AND", () => {
    expect(
      filterOngoingOrders(
        board,
        filters({ pickupCityId: "dc_1", deliveryCityId: "dc_3" }),
      ).map((o) => o.id),
    ).toEqual(["ORD-3"])
    // Contradictory combination: nothing, rather than falling back to one filter.
    expect(
      filterOngoingOrders(
        board,
        filters({ pickupCityId: "dc_2", deliveryCityId: "dc_3" }),
      ),
    ).toEqual([])
  })

  it("keeps a parcel with no pickup city when the pickup filter is untouched", () => {
    // A parcel whose pickup location has gone missing must not vanish from an
    // unfiltered board — only from one that asks about pickup cities. Naively
    // comparing a null `pickupCityId` against every filter would drop it.
    const orphan = makeOrder({
      id: "ORD-ORPHAN",
      status: "APPROVED",
      pickupCityId: null,
      deliveryCityId: "dc_1",
    })
    const rows = [orphan, ...board]

    // Untouched pickup filter: a delivery-city filter alone still includes it.
    expect(
      filterOngoingOrders(rows, filters({ deliveryCityId: "dc_1" })).map(
        (o) => o.id,
      ),
    ).toContain("ORD-ORPHAN")
    // Asking about pickup cities excludes it, because it has none.
    expect(
      filterOngoingOrders(rows, filters({ pickupCityId: "dc_1" })).map(
        (o) => o.id,
      ),
    ).not.toContain("ORD-ORPHAN")
  })
})

describe("isFiltering", () => {
  it("is false only when nothing narrows the board", () => {
    expect(isFiltering(filters())).toBe(false)
    // Whitespace is not a filter: typing a space must not light up "Clear" or
    // trigger the no-matches message over a full board.
    expect(isFiltering(filters({ query: "   " }))).toBe(false)
    expect(isFiltering(filters({ query: "ORD-1" }))).toBe(true)
    expect(isFiltering(filters({ riderId: "rider_1" }))).toBe(true)
    expect(isFiltering(filters({ pickupCityId: "dc_1" }))).toBe(true)
    expect(isFiltering(filters({ deliveryCityId: "dc_1" }))).toBe(true)
  })

  it("treats the sentinels as unset", () => {
    expect(
      isFiltering(
        filters({
          riderId: ANY_RIDER,
          pickupCityId: ANY_CITY,
          deliveryCityId: ANY_CITY,
        }),
      ),
    ).toBe(false)
  })
})
