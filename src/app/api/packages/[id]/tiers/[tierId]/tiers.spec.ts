import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { DELETE, PATCH } from "./route"

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
let deleteCalls = 0

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
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
    delete: () => {
      deleteCalls++
      const chain: Record<string, unknown> = { where: () => chain }
      return chain
    },
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  deleteCalls = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api/packages/pkg_1/tiers/t_1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: "pkg_1", tierId: "t_1" }) }

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}

const tier = {
  id: "t_1",
  packageId: "pkg_1",
  orderCount: 10,
  sortOrder: 10,
  ruleType: "FLAT",
  ruleValue: 50,
}

describe("PATCH /api/packages/:id/tiers/:tierId", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(req("PATCH", { ruleValue: 40 }), params)
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await PATCH(req("PATCH", { ruleValue: 40 }), params)
    expect(res.status).toBe(403)
  })

  it("404 when the tier is not on this package", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await PATCH(req("PATCH", { ruleValue: 40 }), params)
    expect(res.status).toBe(404)
  })

  it("400 when switching to a percentage above 100", async () => {
    sessionState.value = admin
    selectQueue.push([tier])
    const res = await PATCH(
      req("PATCH", { ruleType: "PERCENT_OFF", ruleValue: 120 }),
      params,
    )
    expect(res.status).toBe(400)
  })

  it("400 when the new order count collides with a sibling", async () => {
    sessionState.value = admin
    selectQueue.push([tier])
    selectQueue.push([{ id: "t_2" }])
    const res = await PATCH(req("PATCH", { orderCount: 25 }), params)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/already exists/i)
  })

  it("updates only the fields that were sent", async () => {
    sessionState.value = admin
    selectQueue.push([tier])
    updateResult.push({ ...tier, ruleValue: 40 })

    const res = await PATCH(req("PATCH", { ruleValue: 40 }), params)
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toEqual({ ruleValue: 40 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_TIER_UPDATED" }),
    )
  })

  it("re-ordering a tier onto its own count is allowed", async () => {
    sessionState.value = admin
    selectQueue.push([tier])
    selectQueue.push([{ id: "t_1" }]) // only itself matches
    updateResult.push({ ...tier, orderCount: 10 })

    const res = await PATCH(req("PATCH", { orderCount: 10 }), params)
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/packages/:id/tiers/:tierId", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(req("DELETE"), params)
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await DELETE(req("DELETE"), params)
    expect(res.status).toBe(403)
  })

  it("404 when the tier does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await DELETE(req("DELETE"), params)
    expect(res.status).toBe(404)
    expect(deleteCalls).toBe(0)
  })

  it("deletes the tier and audits it", async () => {
    sessionState.value = admin
    selectQueue.push([tier])
    const res = await DELETE(req("DELETE"), params)
    expect(res.status).toBe(200)
    expect(deleteCalls).toBe(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_TIER_DELETED" }),
    )
  })
})
