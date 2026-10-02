import { describe, expect, it } from "vitest"
import {
  type ActiveStop,
  type AutoAssignOrder,
  type AutoAssignRider,
  groupAssignmentsByRider,
  NO_ELIGIBLE_RIDER_REASON,
  planAutoAssignment,
} from "./auto-assign"

const ZONE_DHAKA = "ZN-DHAKA"
const ZONE_SYLHET = "ZN-SYLHET"
const ZONE_CHITTAGONG = "ZN-CHITTAGONG"
const ZONE_NAMES = new Map([
  [ZONE_DHAKA, "Dhaka Metro"],
  [ZONE_SYLHET, "Divisional Cities"],
  [ZONE_CHITTAGONG, "Divisional Cities"],
])

function order(
  id: string,
  zoneId: string | null = ZONE_DHAKA,
): AutoAssignOrder {
  return { id, zoneId }
}

function rider(id: string, name = `Rider ${id}`): AutoAssignRider {
  return { id, name }
}

function stop(riderId: string, zoneId: string | null = ZONE_DHAKA): ActiveStop {
  return { riderId, zoneId }
}

function plan(overrides: {
  orders: readonly AutoAssignOrder[]
  riders: readonly AutoAssignRider[]
  activeStops?: readonly ActiveStop[]
}) {
  return planAutoAssignment({
    orders: overrides.orders,
    riders: overrides.riders,
    activeStops: overrides.activeStops ?? [],
    zoneNames: ZONE_NAMES,
  })
}

describe("planAutoAssignment", () => {
  it("gives the parcel to the rider carrying the least", () => {
    // The regression this replaces: a manual picker with two equally free
    // riders routinely hands one rider the whole batch.
    const result = plan({
      orders: [order("ORD-000001"), order("ORD-000002"), order("ORD-000003")],
      riders: [rider("RID-1"), rider("RID-2"), rider("RID-3")],
      activeStops: [stop("RID-1"), stop("RID-1"), stop("RID-2")],
    })

    expect(result.assignments.map((a) => [a.orderId, a.riderId])).toEqual([
      ["ORD-000001", "RID-3"],
      ["ORD-000002", "RID-2"],
      ["ORD-000003", "RID-3"],
    ])
  })

  it("spreads a batch across every rider rather than stacking it on one", () => {
    const result = plan({
      orders: [
        order("ORD-000001"),
        order("ORD-000002"),
        order("ORD-000003"),
        order("ORD-000004"),
      ],
      riders: [rider("RID-1"), rider("RID-2")],
    })

    const perRider = result.riderLoads.map((l) => l.assigned)
    expect(perRider).toEqual([2, 2])
    expect(new Set(result.assignments.map((a) => a.riderId)).size).toBe(2)
  })

  it("never leaves the roster more than one parcel apart", () => {
    const result = plan({
      orders: Array.from({ length: 11 }, (_, i) =>
        order(`ORD-${String(i + 1).padStart(6, "0")}`),
      ),
      riders: [rider("RID-1"), rider("RID-2"), rider("RID-3")],
      activeStops: [stop("RID-1"), stop("RID-3")],
    })

    const totals = result.riderLoads.map((l) => l.active + l.assigned)
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1)
  })

  it("breaks an equal load on the zone the rider is already serving", () => {
    // Both free, but RID-1 is already carrying a Dhaka parcel, so the new
    // Dhaka parcel costs that rider no extra travel.
    const result = plan({
      orders: [order("ORD-000001", ZONE_DHAKA)],
      riders: [rider("RID-1"), rider("RID-2")],
      activeStops: [stop("RID-1", ZONE_DHAKA), stop("RID-2", ZONE_SYLHET)],
    })

    expect(result.assignments[0].riderId).toBe("RID-1")
    expect(result.assignments[0].reason).toBe(
      "Tied at 1 active parcels, and already running to Dhaka Metro.",
    )
  })

  it("never lets zone affinity outrank a lighter load", () => {
    // RID-1 is running all over Sylhet and is two parcels lighter; RID-2 is
    // already going to Dhaka but is busier. The parcel goes to RID-1 — a zone
    // bonus must not become licence to hoard, and it only ever breaks a tie.
    const result = plan({
      orders: [order("ORD-000001", ZONE_DHAKA)],
      riders: [rider("RID-1"), rider("RID-2")],
      activeStops: [
        stop("RID-1", ZONE_SYLHET),
        stop("RID-1", ZONE_SYLHET),
        stop("RID-1", ZONE_SYLHET),
        stop("RID-2", ZONE_DHAKA),
        stop("RID-2", ZONE_DHAKA),
        stop("RID-2", ZONE_DHAKA),
        stop("RID-2", ZONE_DHAKA),
      ],
    })

    expect(result.assignments[0].riderId).toBe("RID-1")
    expect(result.assignments[0].reason).toBe("Fewest active parcels (3).")
  })

  it("counts parcels assigned earlier in the same plan", () => {
    // Greedy balancing that only read committed load would hand all three to
    // whichever rider started emptiest.
    const result = plan({
      orders: [
        order("ORD-000001", ZONE_DHAKA),
        order("ORD-000002", ZONE_DHAKA),
        order("ORD-000003", ZONE_DHAKA),
      ],
      riders: [rider("RID-1"), rider("RID-2")],
    })

    expect(result.riderLoads.map((l) => l.assigned)).toEqual([2, 1])
  })

  it("keeps spreading while a free rider is still standing by", () => {
    // Zone affinity is deliberately not allowed to outrank load: the rider who
    // just received a Dhaka parcel is now busier than the idle one next to
    // him, so the next Dhaka parcel goes there too rather than stacking.
    const result = plan({
      orders: [
        order("ORD-000001", ZONE_DHAKA),
        order("ORD-000002", ZONE_DHAKA),
      ],
      riders: [rider("RID-1"), rider("RID-2")],
    })

    expect(result.assignments.map((a) => a.riderId)).toEqual(["RID-1", "RID-2"])
  })

  it("falls back to the rider code when nothing separates the riders", () => {
    const result = plan({
      orders: [order("ORD-000001", ZONE_DHAKA)],
      riders: [rider("RID-9"), rider("RID-2")],
    })

    expect(result.assignments[0].riderId).toBe("RID-2")
    expect(result.assignments[0].reason).toBe(
      "Tied at 0 active parcels; rider code breaks the tie.",
    )
  })

  it("ignores zone preference entirely when the parcel has no destination zone", () => {
    const result = plan({
      orders: [order("ORD-000001", null)],
      riders: [rider("RID-1"), rider("RID-2")],
      activeStops: [stop("RID-1", ZONE_DHAKA), stop("RID-2", ZONE_SYLHET)],
    })

    expect(result.assignments[0].reason).toBe(
      "Tied at 1 active parcels; rider code breaks the tie.",
    )
  })

  it("leaves every parcel unassigned when the warehouse has no delivery rider", () => {
    const result = plan({
      orders: [order("ORD-000001"), order("ORD-000002")],
      riders: [],
    })

    expect(result.assignments).toEqual([])
    expect(result.unassigned).toEqual([
      { orderId: "ORD-000001", reason: NO_ELIGIBLE_RIDER_REASON },
      { orderId: "ORD-000002", reason: NO_ELIGIBLE_RIDER_REASON },
    ])
  })

  it("does not count work a rider outside this roster is carrying", () => {
    // A rider from another warehouse is not a candidate, so their load must not
    // leak into this warehouse's ranking.
    const result = plan({
      orders: [order("ORD-000001")],
      riders: [rider("RID-1")],
      activeStops: [stop("RID-ELSEWHERE"), stop("RID-ELSEWHERE")],
    })

    expect(result.assignments[0].riderId).toBe("RID-1")
    expect(result.riderLoads).toEqual([
      { riderId: "RID-1", riderName: "Rider RID-1", active: 0, assigned: 1 },
    ])
  })

  it("processes parcels oldest-first so the oldest is served first", () => {
    const result = plan({
      orders: [order("ORD-000009"), order("ORD-000001"), order("ORD-000005")],
      riders: [rider("RID-1"), rider("RID-2"), rider("RID-3")],
    })

    expect(result.assignments.map((a) => a.orderId)).toEqual([
      "ORD-000001",
      "ORD-000005",
      "ORD-000009",
    ])
  })

  it("reports every eligible rider, including one left with nothing", () => {
    const result = plan({
      orders: [order("ORD-000001")],
      riders: [rider("RID-1"), rider("RID-2")],
      activeStops: [stop("RID-1"), stop("RID-1")],
    })

    // RID-1 carries two and is passed over; the plan still reports them, so a
    // dispatcher can see the roster they are choosing from.
    expect(result.riderLoads).toEqual([
      { riderId: "RID-1", riderName: "Rider RID-1", active: 2, assigned: 0 },
      { riderId: "RID-2", riderName: "Rider RID-2", active: 0, assigned: 1 },
    ])
  })

  it("returns the same plan for the same input whatever order it arrives in", () => {
    const orders = [
      order("ORD-000003", ZONE_SYLHET),
      order("ORD-000001", ZONE_DHAKA),
      order("ORD-000002", ZONE_DHAKA),
    ]
    const riders = [rider("RID-2"), rider("RID-1")]
    const stops = [stop("RID-1", ZONE_DHAKA)]

    expect(plan({ orders, riders, activeStops: stops })).toEqual(
      plan({
        orders: [...orders].reverse(),
        riders: [...riders].reverse(),
        activeStops: stops,
      }),
    )
  })

  it("describes an unmatched zone without inventing a name", () => {
    const result = plan({
      orders: [order("ORD-000001", "ZN-NEWLY-ADDED")],
      riders: [rider("RID-1"), rider("RID-2")],
      activeStops: [stop("RID-1", "ZN-NEWLY-ADDED"), stop("RID-2", ZONE_DHAKA)],
    })

    expect(result.assignments[0].riderId).toBe("RID-1")
    expect(result.assignments[0].reason).toBe(
      "Tied at 1 active parcels, and already running to that zone.",
    )
  })

  it("handles an empty batch without inventing riders", () => {
    expect(plan({ orders: [], riders: [rider("RID-1")] })).toEqual({
      assignments: [],
      unassigned: [],
      riderLoads: [
        { riderId: "RID-1", riderName: "Rider RID-1", active: 0, assigned: 0 },
      ],
    })
  })
})

describe("groupAssignmentsByRider", () => {
  it("collapses a plan into one bulk dispatch call per rider", () => {
    // The bulk endpoint takes a single rider id, so applying a plan means one
    // call per rider — this grouping is where that shape is decided.
    const result = plan({
      orders: [
        order("ORD-000001"),
        order("ORD-000002"),
        order("ORD-000003"),
        order("ORD-000004"),
      ],
      riders: [rider("RID-1"), rider("RID-2")],
    })

    expect(groupAssignmentsByRider(result)).toEqual([
      {
        riderId: "RID-1",
        riderName: "Rider RID-1",
        orderIds: ["ORD-000001", "ORD-000003"],
      },
      {
        riderId: "RID-2",
        riderName: "Rider RID-2",
        orderIds: ["ORD-000002", "ORD-000004"],
      },
    ])
  })

  it("returns nothing for a plan that assigned nothing", () => {
    const result = plan({ orders: [order("ORD-000001")], riders: [] })
    expect(groupAssignmentsByRider(result)).toEqual([])
  })
})
