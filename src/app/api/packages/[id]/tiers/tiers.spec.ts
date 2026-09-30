import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { POST } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const selectQueue: unknown[][] = []
const insertResult: unknown[] = []
const insertPayloads: Record<string, unknown>[] = []

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
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload)
        return chain
      },
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  insertResult.length = 0
  insertPayloads.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/packages/pkg_1/tiers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: "pkg_1" }) }

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}

describe("POST /api/packages/:id/tiers", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(
      req({ orderCount: 10, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await POST(
      req({ orderCount: 10, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(403)
  })

  it("400 when orderCount is not a whole number", async () => {
    sessionState.value = admin
    const res = await POST(
      req({ orderCount: 1.5, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(400)
  })

  it("400 when orderCount is below 1", async () => {
    sessionState.value = admin
    const res = await POST(
      req({ orderCount: 0, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(400)
  })

  it("400 when the rule type is unknown", async () => {
    sessionState.value = admin
    const res = await POST(
      req({ orderCount: 10, ruleType: "BOGUS", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(400)
  })

  it("400 when a percentage discount exceeds 100", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "pkg_1", name: "Starter" }])
    const res = await POST(
      req({ orderCount: 10, ruleType: "PERCENT_OFF", ruleValue: 150 }),
      params,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/cannot exceed 100/i)
  })

  it("400 when the package does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await POST(
      req({ orderCount: 10, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(404)
  })

  it("400 when that order count already has a tier", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "pkg_1", name: "Starter" }])
    selectQueue.push([{ orderCount: 5 }, { orderCount: 10 }])
    const res = await POST(
      req({ orderCount: 10, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/already exists/i)
  })

  it("201 inserts the tier and defaults sortOrder to orderCount", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "pkg_1", name: "Starter" }])
    selectQueue.push([{ orderCount: 5 }])
    insertResult.push({ id: "t_2", orderCount: 10 })

    const res = await POST(
      req({ orderCount: 10, ruleType: "FLAT", ruleValue: 50 }),
      params,
    )
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      packageId: "pkg_1",
      orderCount: 10,
      ruleType: "FLAT",
      ruleValue: 50,
      sortOrder: 10,
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_TIER_CREATED" }),
    )
  })

  it("201 accepts a percentage discount of exactly 100", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "pkg_1", name: "Starter" }])
    selectQueue.push([])
    insertResult.push({ id: "t_2" })

    const res = await POST(
      req({ orderCount: 25, ruleType: "PERCENT_OFF", ruleValue: 100 }),
      params,
    )
    expect(res.status).toBe(201)
  })
})
