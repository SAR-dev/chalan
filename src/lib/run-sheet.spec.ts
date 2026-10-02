import { describe, expect, it } from "vitest"
import { buildRunSheet, type RunSheetOrder, type RunStop } from "./run-sheet"

const ZONE_DHAKA = "ZN-DHAKA"
const ZONE_SYLHET = "ZN-SYLHET"
const ZONE_CHITTAGONG = "ZN-CHITTAGONG"
const ZONE_NAMES = new Map([
  [ZONE_DHAKA, "Dhaka Metro"],
  [ZONE_SYLHET, "Divisional Cities"],
  [ZONE_CHITTAGONG, "Divisional Cities"],
])

function parcel(
  id: string,
  zoneId: string | null,
  cityName: string | null = "Dhaka",
): RunSheetOrder {
  return { id, zoneId, cityName }
}

function ids(stops: readonly RunStop[]) {
  return stops.map((s) => s.orderId)
}

describe("buildRunSheet", () => {
  it("keeps one zone contiguous instead of interleaving cities", () => {
    // Parcel age would give Dhaka, Sylhet, Dhaka, Sylhet — two wasted crossings
    // for nothing. The sheet groups them.
    const result = buildRunSheet({
      orders: [
        parcel("ORD-000001", ZONE_DHAKA),
        parcel("ORD-000002", ZONE_SYLHET),
        parcel("ORD-000003", ZONE_DHAKA),
        parcel("ORD-000004", ZONE_SYLHET),
      ],
      zoneNames: ZONE_NAMES,
    })

    expect(ids(result.stops)).toEqual([
      "ORD-000001",
      "ORD-000003",
      "ORD-000002",
      "ORD-000004",
    ])
    expect(result.zoneHops).toBe(1)
  })

  it("achieves the minimum possible zone changes for any input", () => {
    const orders = [
      parcel("ORD-000001", ZONE_DHAKA),
      parcel("ORD-000002", ZONE_SYLHET),
      parcel("ORD-000003", ZONE_DHAKA),
      parcel("ORD-000004", ZONE_CHITTAGONG),
      parcel("ORD-000005", ZONE_SYLHET),
      parcel("ORD-000006", ZONE_DHAKA),
      parcel("ORD-000007", ZONE_CHITTAGONG),
    ]

    const result = buildRunSheet({ orders, zoneNames: ZONE_NAMES })

    // Each zone visited once is the floor; anything worse is a bug.
    expect(result.zoneCount).toBe(3)
    expect(result.zoneHops).toBe(2)
  })

  it("numbers the stops from one with no gaps", () => {
    const result = buildRunSheet({
      orders: [
        parcel("ORD-000002", ZONE_SYLHET),
        parcel("ORD-000001", ZONE_DHAKA),
      ],
      zoneNames: ZONE_NAMES,
    })

    expect(result.stops.map((s) => s.sequence)).toEqual([1, 2])
  })

  it("runs the longest zone first so the biggest chunk of the day is settled", () => {
    const result = buildRunSheet({
      orders: [
        parcel("ORD-000001", ZONE_SYLHET),
        parcel("ORD-000002", ZONE_SYLHET),
        parcel("ORD-000003", ZONE_CHITTAGONG),
        parcel("ORD-000004", ZONE_DHAKA),
      ],
      zoneNames: ZONE_NAMES,
    })

    expect(ids(result.stops)).toEqual([
      "ORD-000001",
      "ORD-000002",
      "ORD-000003",
      "ORD-000004",
    ])
  })

  it("orders same-zone parcels oldest-first", () => {
    const result = buildRunSheet({
      orders: [
        parcel("ORD-000004", ZONE_DHAKA),
        parcel("ORD-000001", ZONE_DHAKA),
        parcel("ORD-000002", ZONE_DHAKA),
      ],
      zoneNames: ZONE_NAMES,
    })

    expect(ids(result.stops)).toEqual([
      "ORD-000001",
      "ORD-000002",
      "ORD-000004",
    ])
  })

  it("reports no zone change for a single-zone run", () => {
    const result = buildRunSheet({
      orders: [
        parcel("ORD-000001", ZONE_DHAKA),
        parcel("ORD-000002", ZONE_DHAKA),
      ],
      zoneNames: ZONE_NAMES,
    })

    expect(result.zoneHops).toBe(0)
    expect(result.zoneCount).toBe(1)
  })

  it("treats parcels with no destination zone as their own group", () => {
    // A parcel with no city cannot be reasoned about geographically, but it
    // still needs a place in the run — and must not be silently folded into a
    // real zone.
    const result = buildRunSheet({
      orders: [
        parcel("ORD-000001", ZONE_DHAKA),
        parcel("ORD-000002", null, null),
        parcel("ORD-000003", ZONE_DHAKA),
      ],
      zoneNames: ZONE_NAMES,
    })

    expect(result.stops.map((s) => s.zoneId)).toEqual([
      ZONE_DHAKA,
      ZONE_DHAKA,
      null,
    ])
    expect(result.stops[2].zoneName).toBeNull()
    expect(result.zoneHops).toBe(1)
  })

  it("carries the zone and city name onto each stop", () => {
    const result = buildRunSheet({
      orders: [parcel("ORD-000001", ZONE_DHAKA, "Gazipur")],
      zoneNames: ZONE_NAMES,
    })

    expect(result.stops[0]).toEqual({
      orderId: "ORD-000001",
      sequence: 1,
      zoneId: ZONE_DHAKA,
      zoneName: "Dhaka Metro",
      cityName: "Gazipur",
    })
  })

  it("leaves the zone name null when the zone cannot be resolved", () => {
    const result = buildRunSheet({
      orders: [parcel("ORD-000001", "ZN-GONE")],
      zoneNames: ZONE_NAMES,
    })

    expect(result.stops[0].zoneId).toBe("ZN-GONE")
    expect(result.stops[0].zoneName).toBeNull()
  })

  it("returns an empty sheet for an empty run", () => {
    expect(buildRunSheet({ orders: [] })).toEqual({
      stops: [],
      zoneHops: 0,
      zoneCount: 0,
    })
  })

  it("does not mutate the orders it was given", () => {
    const orders = [
      parcel("ORD-000002", ZONE_SYLHET),
      parcel("ORD-000001", ZONE_DHAKA),
    ]

    buildRunSheet({ orders, zoneNames: ZONE_NAMES })

    expect(orders.map((o) => o.id)).toEqual(["ORD-000002", "ORD-000001"])
  })

  it("returns the same sheet for the same input whatever order it arrives in", () => {
    const orders = [
      parcel("ORD-000001", ZONE_SYLHET),
      parcel("ORD-000002", ZONE_DHAKA),
      parcel("ORD-000003", ZONE_SYLHET),
    ]

    expect(buildRunSheet({ orders, zoneNames: ZONE_NAMES })).toEqual(
      buildRunSheet({
        orders: [...orders].reverse(),
        zoneNames: ZONE_NAMES,
      }),
    )
  })
})
