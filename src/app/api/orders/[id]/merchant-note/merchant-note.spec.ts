import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as updateMerchantNote } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const otherMerchant = {
  role: "MERCHANT",
  name: "Merchant Mo",
  userId: "u3",
  merchantId: "m_2",
}
const riderSession = { role: "RIDER", name: "Rider", userId: "u4" }

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  sessionState.value = null
})

function req(body: unknown): Request {
  return new Request("http://test.local/api", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function ctx(id = "o_1") {
  return { params: Promise.resolve({ id }) }
}

describe("PATCH /api/orders/:id/merchant-note", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateMerchantNote(req({ merchantNote: "Hi" }), ctx())
    expect(res.status).toBe(401)
  })

  it("400 when note is empty", async () => {
    sessionState.value = merchantSession
    const res = await updateMerchantNote(req({ merchantNote: "" }), ctx())
    expect(res.status).toBe(400)
  })

  it("404 when order not found", async () => {
    sessionState.value = merchantSession
    selectQueue.push([])
    const res = await updateMerchantNote(req({ merchantNote: "Hi" }), ctx())
    expect(res.status).toBe(404)
  })

  it("403 when the order belongs to another merchant", async () => {
    sessionState.value = otherMerchant
    selectQueue.push([{ id: "o_1", status: "PENDING", merchantId: "m_1" }])
    const res = await updateMerchantNote(req({ merchantNote: "Hi" }), ctx())
    expect(res.status).toBe(403)
  })

  it("403 for riders", async () => {
    sessionState.value = riderSession
    selectQueue.push([{ id: "o_1", status: "PENDING", merchantId: "m_1" }])
    const res = await updateMerchantNote(req({ merchantNote: "Hi" }), ctx())
    expect(res.status).toBe(403)
  })

  it("409 when the order is already completed", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "o_1", status: "DELIVERED", merchantId: "m_1" }])
    const res = await updateMerchantNote(req({ merchantNote: "Hi" }), ctx())
    expect(res.status).toBe(409)
  })

  it("updates the note on the merchant's own order", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "o_1", status: "PENDING", merchantId: "m_1" }])
    updateResult.push({ id: "o_1", merchantNote: "Hi" })
    const res = await updateMerchantNote(req({ merchantNote: " Hi " }), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ merchantNote: "Hi" })
  })

  it("super admin may update any order's note", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "o_1", status: "APPROVED", merchantId: "m_9" }])
    updateResult.push({ id: "o_1", merchantNote: "Hi" })
    const res = await updateMerchantNote(req({ merchantNote: "Hi" }), ctx())
    expect(res.status).toBe(200)
  })
})
