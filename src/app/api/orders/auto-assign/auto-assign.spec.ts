import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as autoAssign } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = { select: () => makeSelectChain() }
  return { db, dbRead: { ...db }, pool: {} }
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/orders/auto-assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const whAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u4",
  warehouseId: "WH-000001",
}
const whAdminNoHub = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Wilma",
  userId: "u5",
  warehouseId: null,
}
const superAdmin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u2" }
const merchant = { role: "MERCHANT", name: "Merchant Moe", userId: "u1" }

function waitingInWarehouse(
  id: string,
  zoneId: string | null = "ZN-DHAKA",
  zoneName: string | null = "Dhaka Metro",
) {
  return {
    id,
    status: "IN_WAREHOUSE",
    warehouseId: "WH-000001",
    zoneId,
    zoneName,
  }
}

/**
 * Queues the three reads the route issues, in order: the requested orders, the
 * warehouse's delivery riders, and what those riders are already carrying. The
 * third read is skipped entirely when no rider is eligible, so `stops` is
 * optional.
 */
function queueReads({
  orders = [],
  riders = [{ id: "RID-000001", name: "Rafi", taskType: "DELIVERY" }],
  stops = [],
}: {
  orders?: unknown[]
  riders?: unknown[]
  stops?: unknown[]
}) {
  selectQueue.push(orders, riders)
  if (riders.length > 0) selectQueue.push(stops)
}

beforeEach(() => {
  selectQueue.length = 0
  sessionState.value = null
})

describe("POST /api/orders/auto-assign", () => {
  it("401 when unauthenticated", async () => {
    const res = await autoAssign(req({ ids: ["ORD-000001"] }))
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await autoAssign(req({ ids: ["ORD-000001"] }))
    expect(res.status).toBe(403)
  })

  it("403 for a super admin — planning is a warehouse desk job", async () => {
    // A super admin has no hub, so there is no roster to balance across and no
    // parcels they could legally dispatch. Let them use the bulk picker.
    sessionState.value = superAdmin
    const res = await autoAssign(req({ ids: ["ORD-000001"] }))
    expect(res.status).toBe(403)
  })

  it("403 for a warehouse admin with no hub", async () => {
    sessionState.value = whAdminNoHub
    const res = await autoAssign(req({ ids: ["ORD-000001"] }))
    expect(res.status).toBe(403)
  })

  it("400 for an empty selection", async () => {
    sessionState.value = whAdmin
    const res = await autoAssign(req({ ids: [] }))
    expect(res.status).toBe(400)
  })

  it("400 for a body over the bulk limit", async () => {
    sessionState.value = whAdmin
    const ids = Array.from({ length: 101 }, (_, i) => `ORD-${i}`)
    const res = await autoAssign(req({ ids }))
    expect(res.status).toBe(400)
  })

  it("spreads a selection across the warehouse's riders", async () => {
    sessionState.value = whAdmin
    queueReads({
      orders: [
        waitingInWarehouse("ORD-000001"),
        waitingInWarehouse("ORD-000002"),
        waitingInWarehouse("ORD-000003"),
      ],
      riders: [
        { id: "RID-000001", name: "Rafi", taskType: "DELIVERY" },
        { id: "RID-000002", name: "Sadia", taskType: "BOTH" },
      ],
    })

    const json = await (
      await autoAssign(req({ ids: ["ORD-000001", "ORD-000002", "ORD-000003"] }))
    ).json()

    expect(json.assignments).toEqual([
      {
        orderId: "ORD-000001",
        riderId: "RID-000001",
        riderName: "Rafi",
        reason: "Tied at 0 active parcels; rider code breaks the tie.",
      },
      {
        orderId: "ORD-000002",
        riderId: "RID-000002",
        riderName: "Sadia",
        reason: "Fewest active parcels (0).",
      },
      {
        orderId: "ORD-000003",
        riderId: "RID-000001",
        riderName: "Rafi",
        reason: "Tied at 1 active parcels; rider code breaks the tie.",
      },
    ])
    expect(json.eligibleRiderCount).toBe(2)
    expect(json.riderLoads).toEqual([
      { riderId: "RID-000001", riderName: "Rafi", active: 0, assigned: 2 },
      { riderId: "RID-000002", riderName: "Sadia", active: 0, assigned: 1 },
    ])
  })

  it("balances against what riders are already carrying", async () => {
    sessionState.value = whAdmin
    queueReads({
      orders: [waitingInWarehouse("ORD-000001")],
      riders: [
        { id: "RID-000001", name: "Rafi", taskType: "DELIVERY" },
        { id: "RID-000002", name: "Sadia", taskType: "DELIVERY" },
      ],
      stops: [
        { riderId: "RID-000001", zoneId: "ZN-DHAKA" },
        { riderId: "RID-000001", zoneId: "ZN-DHAKA" },
        { riderId: "RID-000001", zoneId: "ZN-DHAKA" },
        { riderId: "RID-000002", zoneId: "ZN-SYLHET" },
      ],
    })

    const json = await (await autoAssign(req({ ids: ["ORD-000001"] }))).json()

    expect(json.assignments[0].riderId).toBe("RID-000002")
    expect(json.assignments[0].reason).toBe("Fewest active parcels (1).")
    expect(json.riderLoads).toEqual([
      {
        riderId: "RID-000001",
        riderName: "Rafi",
        active: 3,
        assigned: 0,
      },
      {
        riderId: "RID-000002",
        riderName: "Sadia",
        active: 1,
        assigned: 1,
      },
    ])
  })

  it("names the zone when zone affinity settled the choice", async () => {
    sessionState.value = whAdmin
    queueReads({
      orders: [waitingInWarehouse("ORD-000001")],
      riders: [
        { id: "RID-000001", name: "Rafi", taskType: "DELIVERY" },
        { id: "RID-000002", name: "Sadia", taskType: "DELIVERY" },
      ],
      stops: [
        { riderId: "RID-000001", zoneId: "ZN-DHAKA" },
        { riderId: "RID-000002", zoneId: "ZN-SYLHET" },
      ],
    })

    const json = await (await autoAssign(req({ ids: ["ORD-000001"] }))).json()

    expect(json.assignments[0].reason).toBe(
      "Tied at 1 active parcels, and already running to Dhaka Metro.",
    )
  })

  it("de-duplicates a repeated id before planning", async () => {
    sessionState.value = whAdmin
    queueReads({ orders: [waitingInWarehouse("ORD-000001")] })

    const json = await (
      await autoAssign(req({ ids: ["ORD-000001", "ORD-000001"] }))
    ).json()

    expect(json.assignments).toHaveLength(1)
  })

  it("refuses to plan for a parcel held at another warehouse", async () => {
    // Proposing it would produce a plan the dispatch transition then rejects,
    // so it is reported instead of assigned.
    sessionState.value = whAdmin
    queueReads({
      orders: [
        { ...waitingInWarehouse("ORD-000001"), warehouseId: "WH-000002" },
      ],
    })

    const json = await (await autoAssign(req({ ids: ["ORD-000001"] }))).json()

    expect(json.assignments).toEqual([])
    expect(json.unassigned).toEqual([
      { orderId: "ORD-000001", reason: "Held at a different warehouse." },
    ])
  })

  it("refuses to plan for a parcel that is not waiting in the warehouse", async () => {
    sessionState.value = whAdmin
    queueReads({
      orders: [{ ...waitingInWarehouse("ORD-000001"), status: "IN_TRANSIT" }],
    })

    const json = await (await autoAssign(req({ ids: ["ORD-000001"] }))).json()

    expect(json.unassigned).toEqual([
      {
        orderId: "ORD-000001",
        reason: "Only parcels waiting in the warehouse can be dispatched.",
      },
    ])
  })

  it("reports an id that matches no order", async () => {
    sessionState.value = whAdmin
    queueReads({ orders: [] })

    const json = await (await autoAssign(req({ ids: ["ORD-999999"] }))).json()

    expect(json.unassigned).toEqual([
      { orderId: "ORD-999999", reason: "Order not found." },
    ])
  })

  it("leaves everything unassigned when the hub has no delivery rider", async () => {
    sessionState.value = whAdmin
    queueReads({ orders: [waitingInWarehouse("ORD-000001")], riders: [] })

    const json = await (await autoAssign(req({ ids: ["ORD-000001"] }))).json()

    expect(json.assignments).toEqual([])
    expect(json.unassigned).toEqual([
      {
        orderId: "ORD-000001",
        reason: "No active delivery rider is based at this warehouse.",
      },
    ])
    expect(json.eligibleRiderCount).toBe(0)
  })

  it("still balances when a parcel has no destination zone", async () => {
    sessionState.value = whAdmin
    queueReads({
      orders: [waitingInWarehouse("ORD-000001", null, null)],
      riders: [
        { id: "RID-000001", name: "Rafi", taskType: "DELIVERY" },
        { id: "RID-000002", name: "Sadia", taskType: "DELIVERY" },
      ],
    })

    const json = await (await autoAssign(req({ ids: ["ORD-000001"] }))).json()

    expect(json.assignments[0].reason).toBe(
      "Tied at 0 active parcels; rider code breaks the tie.",
    )
  })
})
