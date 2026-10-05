import { describe, expect, it } from "vitest"
import { makeOrder, makeRider } from "@/app/__tests__/test-utils"
import {
  groupOngoingByRider,
  groupOngoingByStatus,
  inWarehouseIds,
  nextLegRiderId,
  ONGOING_STATUSES,
  UNASSIGNED_COLUMN,
} from "@/features/orders/kanban-grouping"

const rider = (id: string, name: string) => makeRider({ id, name })

describe("groupOngoingByStatus", () => {
  it("returns one column per ongoing status, in board order", () => {
    const columns = groupOngoingByStatus([])
    expect(columns.map((c) => c.id)).toEqual([...ONGOING_STATUSES])
  })

  it("keeps empty columns so the board does not jump", () => {
    const columns = groupOngoingByStatus([
      makeOrder({ status: "IN_WAREHOUSE" }),
    ])
    expect(columns.find((c) => c.id === "IN_WAREHOUSE")?.orders).toHaveLength(1)
    expect(columns.find((c) => c.id === "APPROVED")?.orders).toEqual([])
  })

  it("ignores rows outside the ongoing set", () => {
    const columns = groupOngoingByStatus([
      makeOrder({ status: "PENDING" }),
      makeOrder({ status: "DELIVERED" }),
      makeOrder({ status: "IN_TRANSIT" }),
    ])
    const placed = columns.flatMap((c) => c.orders)
    expect(placed).toHaveLength(1)
    expect(placed[0].status).toBe("IN_TRANSIT")
  })
})

describe("nextLegRiderId", () => {
  it("puts pre-receipt parcels under the pickup rider", () => {
    expect(
      nextLegRiderId(
        makeOrder({ status: "APPROVED", pickupRiderId: "rider_1" }),
      ),
    ).toBe("rider_1")
    expect(
      nextLegRiderId(
        makeOrder({ status: "PICKED_UP", pickupRiderId: "rider_2" }),
      ),
    ).toBe("rider_2")
  })

  it("puts post-receipt parcels under the delivery rider", () => {
    for (const status of [
      "IN_WAREHOUSE",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
    ] as const) {
      expect(
        nextLegRiderId(
          makeOrder({
            status,
            pickupRiderId: "rider_1",
            deliveryRiderId: "rider_2",
          }),
        ),
      ).toBe("rider_2")
    }
  })

  it("ignores the pickup rider once the parcel is in the warehouse", () => {
    // The delivery rider is the only one who can act, so a stale pickupRiderId
    // must not decide the column.
    expect(
      nextLegRiderId(
        makeOrder({
          status: "IN_WAREHOUSE",
          pickupRiderId: "rider_1",
          deliveryRiderId: null,
        }),
      ),
    ).toBeNull()
  })

  it("returns null for statuses with no next leg", () => {
    expect(nextLegRiderId(makeOrder({ status: "DELIVERED" }))).toBeNull()
  })
})

describe("groupOngoingByRider", () => {
  const riders = [rider("rider_1", "Rakib"), rider("rider_2", "Sadia")]

  it("places every card in exactly one column", () => {
    const rows = [
      makeOrder({ status: "APPROVED", pickupRiderId: "rider_1" }),
      makeOrder({ status: "OUT_FOR_PICKUP", pickupRiderId: "rider_1" }),
      makeOrder({ status: "PICKED_UP", pickupRiderId: "rider_2" }),
      makeOrder({ status: "IN_WAREHOUSE", deliveryRiderId: "rider_1" }),
      makeOrder({ status: "IN_TRANSIT", deliveryRiderId: "rider_2" }),
      makeOrder({ status: "OUT_FOR_DELIVERY" }),
    ]
    const columns = groupOngoingByRider(rows, riders)
    const placed = columns.flatMap((c) => c.orders)
    expect(placed).toHaveLength(rows.length)
    expect(new Set(placed.map((o) => o.id)).size).toBe(rows.length)
  })

  it("files a PICKED_UP parcel under the pickup rider, not the delivery one", () => {
    const columns = groupOngoingByRider(
      [makeOrder({ status: "PICKED_UP", pickupRiderId: "rider_1" })],
      riders,
    )
    expect(columns.find((c) => c.id === "rider_1")?.orders).toHaveLength(1)
    expect(columns.find((c) => c.id === "rider_2")?.orders).toHaveLength(0)
  })

  it("files an IN_WAREHOUSE parcel under the delivery rider / Unassigned", () => {
    const assigned = groupOngoingByRider(
      [makeOrder({ status: "IN_WAREHOUSE", deliveryRiderId: "rider_2" })],
      riders,
    )
    expect(assigned.find((c) => c.id === "rider_2")?.orders).toHaveLength(1)

    const unassigned = groupOngoingByRider(
      [makeOrder({ status: "IN_WAREHOUSE", deliveryRiderId: null })],
      riders,
    )
    expect(
      unassigned.find((c) => c.id === UNASSIGNED_COLUMN)?.orders,
    ).toHaveLength(1)
  })

  it("keeps empty rider columns", () => {
    const columns = groupOngoingByRider([], riders)
    expect(columns.map((c) => c.id)).toEqual(["rider_1", "rider_2"])
    expect(columns.every((c) => c.orders.length === 0)).toBe(true)
  })

  it("orders columns by roster and puts Unassigned last", () => {
    const columns = groupOngoingByRider(
      [
        makeOrder({ status: "APPROVED", pickupRiderId: null }),
        makeOrder({ status: "APPROVED", pickupRiderId: "rider_2" }),
      ],
      riders,
    )
    expect(columns.map((c) => c.id)).toEqual([
      "rider_1",
      "rider_2",
      UNASSIGNED_COLUMN,
    ])
  })

  it("keeps a card whose rider is missing from the roster", () => {
    const columns = groupOngoingByRider(
      [makeOrder({ status: "IN_TRANSIT", deliveryRiderId: "ghost" })],
      riders,
    )
    expect(columns.flatMap((c) => c.orders)).toHaveLength(1)
    expect(columns.map((c) => c.id)).toContain("ghost")
  })
})

describe("inWarehouseIds", () => {
  it("collects only parcels eligible for a dispatch", () => {
    const rows = [
      makeOrder({ status: "IN_WAREHOUSE" }),
      makeOrder({ status: "PICKED_UP" }),
      makeOrder({ status: "IN_WAREHOUSE" }),
    ]
    const ids = inWarehouseIds(rows)
    expect(ids).toEqual([rows[0].id, rows[2].id])
  })

  it("returns an empty list when nothing is held", () => {
    expect(inWarehouseIds([makeOrder({ status: "IN_TRANSIT" })])).toEqual([])
  })
})
