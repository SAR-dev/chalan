import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as approve } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
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
  vi.mocked(logAudit).mockClear()
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/orders/bulk/approve", {
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
const merchant = { role: "MERCHANT", name: "Merchant Moe", userId: "u1" }
const rider = { role: "RIDER", name: "Rider Rick", userId: "u3" }

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "PENDING",
    merchantId: "m1",
    warehouseId: null,
    pickupRiderId: null,
    parcelWeightKg: 2,
    ...overrides,
  }
}

describe("PATCH /api/orders/bulk/approve", () => {
  it("401 when unauthenticated", async () => {
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = whAdmin
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchant
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body", async () => {
    sessionState.value = admin
    const res = await approve(req({}))
    expect(res.status).toBe(400)
  })

  it("400 when no orders found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("No orders found for the given IDs.")
  })

  it("400 when order is not PENDING", async () => {
    sessionState.value = admin
    selectQueue.push([makeOrder({ status: "APPROVED" })])
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Only PENDING orders can be approved")
  })

  it("400 when parcel weight exceeds merchant limit", async () => {
    sessionState.value = admin
    selectQueue.push(
      [makeOrder({ parcelWeightKg: 10 })],
      [{ maxWeightKg: 5, status: "ACTIVE" }],
    )
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe(
      "Parcel weight exceeds the 5 KG limit and cannot be approved.",
    )
  })

  it("approves orders and returns count", async () => {
    sessionState.value = admin
    selectQueue.push(
      [makeOrder({ status: "PENDING", parcelWeightKg: 2 })],
      [{ maxWeightKg: 5, status: "ACTIVE" }],
    )
    updateResult.push(makeOrder({ status: "APPROVED" }))
    const res = await approve(req({ ids: ["o1"] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "APPROVED",
      approvedBy: "Admin Amy",
    })
    expect(typeof updatePayloads[0].approvedAt).toBe("string")
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ORDER_APPROVE",
        entityType: "order",
        entityId: "o1",
        metadata: {
          diff: { status: { from: "PENDING", to: "APPROVED" } },
        },
      }),
      expect.anything(),
    )
  })
})
