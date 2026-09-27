import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as receive } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
      for: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (vals: Record<string, unknown>) => {
        updatePayloads.push(vals)
        return chain
      },
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: () => chain,
      onConflictDoUpdate: () => chain,
      onConflictDoNothing: () => chain,
      returning: () => Promise.resolve([]),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
    insert: () => makeInsertChain(),
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  sessionState.value = null
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/orders/bulk/receive", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const whAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u4",
  warehouseId: "wh_1",
}
const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u2" }
const merchant = { role: "MERCHANT", name: "Merchant Moe", userId: "u1" }
const rider = { role: "RIDER", name: "Rider Rick", userId: "u3" }

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "PICKED_UP",
    merchantId: "m1",
    warehouseId: "wh_1",
    pickupRiderId: null,
    deliveryRiderId: null,
    parcelWeightKg: 2,
    ...overrides,
  }
}

describe("PATCH /api/orders/bulk/receive", () => {
  it("401 when unauthenticated", async () => {
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for super admin", async () => {
    sessionState.value = admin
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchant
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for warehouse admin without warehouseId", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH Walt",
      userId: "u4",
    }
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body", async () => {
    sessionState.value = whAdmin
    const res = await receive(req({}))
    expect(res.status).toBe(400)
  })

  it("400 when no orders found", async () => {
    sessionState.value = whAdmin
    selectQueue.push([])
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("No orders found for the given IDs.")
  })

  it("400 when parcel is not PICKED_UP", async () => {
    sessionState.value = whAdmin
    selectQueue.push([makeOrder({ status: "IN_WAREHOUSE" })])
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Only PICKED_UP parcels can be received.")
  })

  it("receives parcels into the admin's warehouse", async () => {
    sessionState.value = whAdmin
    selectQueue.push([makeOrder()])
    updateResult.push(makeOrder({ status: "IN_WAREHOUSE" }))
    const res = await receive(req({ ids: ["o1"] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "IN_WAREHOUSE",
      warehouseId: "wh_1",
      receivedByWarehouse: "WH Walt",
    })
    expect(typeof updatePayloads[0].receivedAtWarehouseAt).toBe("string")
  })

  it("only receives PICKED_UP parcels when mixed", async () => {
    sessionState.value = whAdmin
    selectQueue.push([
      makeOrder(),
      makeOrder({ id: "o2", status: "IN_WAREHOUSE" }),
    ])
    updateResult.push(makeOrder({ status: "IN_WAREHOUSE" }))
    const res = await receive(req({ ids: ["o1", "o2"] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(1)
  })
})
