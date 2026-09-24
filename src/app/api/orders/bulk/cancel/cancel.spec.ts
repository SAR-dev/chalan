import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as cancel } from "./route"

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
  const db = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
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
  return new Request("http://test.local/api/orders/bulk/cancel", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u2" }
const whAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u4",
  warehouseId: "wh_1",
}
const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u1",
  merchantId: "m1",
}
const rider = { role: "RIDER", name: "Rider Rick", userId: "u3" }

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "PENDING",
    merchantId: "m1",
    warehouseId: "wh_1",
    pickupRiderId: null,
    deliveryRiderId: null,
    parcelWeightKg: 2,
    ...overrides,
  }
}

describe("PATCH /api/orders/bulk/cancel", () => {
  it("401 when unauthenticated", async () => {
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("400 when ids missing", async () => {
    sessionState.value = admin
    const res = await cancel(req({}))
    expect(res.status).toBe(400)
  })

  it("400 when reason is blank", async () => {
    sessionState.value = admin
    const res = await cancel(req({ ids: ["o1"], reason: "   " }))
    expect(res.status).toBe(400)
  })

  it("400 when no orders found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("No orders found for the given IDs.")
  })

  it("403 when merchant cancels another merchant's order", async () => {
    sessionState.value = { ...merchant, merchantId: "m2" }
    selectQueue.push([makeOrder({ status: "PENDING", merchantId: "m1" })])
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe("Forbidden")
  })

  it("400 when merchant cancels after pickup", async () => {
    sessionState.value = merchant
    selectQueue.push([makeOrder({ status: "PICKED_UP", merchantId: "m1" })])
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe(
      "Orders can only be cancelled before they are picked up.",
    )
  })

  it("400 when admin cancels out-for-delivery order", async () => {
    sessionState.value = admin
    selectQueue.push([makeOrder({ status: "OUT_FOR_DELIVERY" })])
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe(
      "Orders cannot be cancelled once they are out for delivery.",
    )
  })

  it("admin cancels with trimmed reason", async () => {
    sessionState.value = admin
    selectQueue.push([makeOrder({ status: "PENDING" })])
    updateResult.push(makeOrder({ status: "CANCELLED" }))
    const res = await cancel(req({ ids: ["o1"], reason: "  duplicate  " }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "Admin Amy",
      cancelReason: "duplicate",
    })
    expect(typeof updatePayloads[0].cancelledAt).toBe("string")
  })

  it("warehouse admin cancels held parcel", async () => {
    sessionState.value = whAdmin
    selectQueue.push([
      makeOrder({ status: "IN_WAREHOUSE", warehouseId: "wh_1" }),
    ])
    updateResult.push(makeOrder({ status: "CANCELLED" }))
    const res = await cancel(req({ ids: ["o1"] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "WH Walt",
      cancelReason: null,
    })
  })

  it("merchant cancels own pending order", async () => {
    sessionState.value = merchant
    selectQueue.push([makeOrder({ status: "PENDING", merchantId: "m1" })])
    updateResult.push(makeOrder({ status: "CANCELLED" }))
    const res = await cancel(req({ ids: ["o1"], reason: "customer request" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "CANCELLED",
      cancelledBy: "Merchant Moe",
      cancelReason: "customer request",
    })
  })

  it("only cancels eligible orders when mixed", async () => {
    sessionState.value = admin
    selectQueue.push([
      makeOrder({ status: "PENDING" }),
      makeOrder({ id: "o2", status: "OUT_FOR_DELIVERY" }),
    ])
    updateResult.push(makeOrder({ status: "CANCELLED" }))
    const res = await cancel(req({ ids: ["o1", "o2"] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(1)
  })
})
