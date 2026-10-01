import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as settleCod } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
  logAuditMany: () => Promise.resolve(),
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
  return new Request("http://test.local/api/orders/bulk/settle-cod", {
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

describe("PATCH /api/orders/bulk/settle-cod", () => {
  it("401 when unauthenticated", async () => {
    const res = await settleCod(req({ ids: ["o1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for admin", async () => {
    sessionState.value = admin
    const res = await settleCod(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchant
    const res = await settleCod(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await settleCod(req({ ids: ["o1"] }))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body", async () => {
    sessionState.value = whAdmin
    const res = await settleCod(req({}))
    expect(res.status).toBe(400)
  })

  it("400 when no settleable orders found", async () => {
    sessionState.value = whAdmin
    selectQueue.push([])
    const res = await settleCod(req({ ids: ["o1"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("No orders found for the given IDs.")
  })

  it("settles orders and returns count", async () => {
    sessionState.value = whAdmin
    selectQueue.push([
      {
        id: "o1",
        status: "DELIVERED",
        warehouseId: "wh_1",
        codSettledAt: null,
        merchantId: "m1",
        merchantEarnings: 0,
      },
    ])
    updateResult.push({
      id: "o1",
      status: "DELIVERED",
      warehouseId: "wh_1",
      codSettledAt: new Date().toISOString(),
      codSettledBy: "WH Walt",
    })
    const res = await settleCod(req({ ids: ["o1"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 1 })
  })

  it("only settles DELIVERED orders with null codSettledAt", async () => {
    sessionState.value = whAdmin
    selectQueue.push([
      {
        id: "o1",
        status: "DELIVERED",
        warehouseId: "wh_1",
        codSettledAt: null,
      },
      {
        id: "o2",
        status: "PICKED_UP",
        warehouseId: "wh_1",
        codSettledAt: null,
      },
      {
        id: "o3",
        status: "DELIVERED",
        warehouseId: "wh_2",
        codSettledAt: null,
      },
      {
        id: "o4",
        status: "DELIVERED",
        warehouseId: "wh_1",
        codSettledAt: "2026-01-01T00:00:00.000Z",
      },
    ])
    updateResult.push({ id: "o1" })
    const res = await settleCod(req({ ids: ["o1", "o2", "o3", "o4"] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(1)
  })

  it("sets codSettledAt and codSettledBy on update", async () => {
    sessionState.value = whAdmin
    selectQueue.push([
      {
        id: "o1",
        status: "DELIVERED",
        warehouseId: "wh_1",
        codSettledAt: null,
      },
    ])
    updateResult.push({ id: "o1" })
    await settleCod(req({ ids: ["o1"] }))
    expect(updatePayloads[0]).toMatchObject({
      codSettledBy: "WH Walt",
    })
    expect(updatePayloads[0].codSettledAt).toBeDefined()
    expect(typeof updatePayloads[0].codSettledAt).toBe("string")
  })
})
