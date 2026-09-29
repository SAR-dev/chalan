import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { POST as requestPackage } from "./route"

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
      onConflictDoUpdate: () => chain,
      onConflictDoNothing: () => chain,
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => ({ set: () => ({ where: () => ({}) }) }),
    insert: () => makeInsertChain(),
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
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
  return new Request("http://test.local/api/packages/pkg_1/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: "pkg_1" }) }

const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u1",
  merchantId: "m_1",
}
const merchantNoShop = {
  role: "MERCHANT",
  name: "Merchant Mo",
  userId: "u2",
  merchantId: "",
}
const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u3" }
const rider = { role: "RIDER", name: "Rider Rick", userId: "u4" }

describe("POST /api/packages/:id/request", () => {
  it("401 when unauthenticated", async () => {
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(401)
  })

  it("403 for admin", async () => {
    sessionState.value = admin
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(403)
  })

  it("403 when the session has no merchant shop", async () => {
    sessionState.value = merchantNoShop
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(403)
  })

  it("409 when a request is already awaiting review", async () => {
    sessionState.value = merchant
    selectQueue.push([{ id: "req_1" }])
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/awaiting review/i)
  })

  it("409 when a bundle is already active", async () => {
    sessionState.value = merchant
    selectQueue.push([]) // no pending request
    selectQueue.push([{ id: "mp_1" }]) // active bundle
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/active package/i)
  })

  it("404 when the package does not exist", async () => {
    sessionState.value = merchant
    selectQueue.push([], [])
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(404)
  })

  it("400 when the package is inactive", async () => {
    sessionState.value = merchant
    selectQueue.push([], [])
    selectQueue.push([
      { id: "pkg_1", name: "Old", price: 500, isActive: false },
    ])
    const res = await requestPackage(req(), params)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/no longer available/i)
  })

  it("201 snapshots the price and logs the request", async () => {
    sessionState.value = merchant
    selectQueue.push([], [])
    selectQueue.push([
      { id: "pkg_1", name: "Starter", price: 1000, isActive: true },
    ])
    insertResult.push({ id: "req_1", status: "PENDING", amount: "1000.00" })

    const res = await requestPackage(
      req({ note: "  paid via bKash  " }),
      params,
    )
    expect(res.status).toBe(201)

    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      packageId: "pkg_1",
      amount: 1000,
      status: "PENDING",
      note: "paid via bKash",
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_REQUESTED" }),
      expect.anything(),
    )
  })

  it("201 works with no request body at all", async () => {
    sessionState.value = merchant
    selectQueue.push([], [])
    selectQueue.push([
      { id: "pkg_1", name: "Starter", price: 1000, isActive: true },
    ])
    insertResult.push({ id: "req_1", status: "PENDING" })

    const res = await requestPackage(req(), params)
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({ note: undefined })
  })
})
