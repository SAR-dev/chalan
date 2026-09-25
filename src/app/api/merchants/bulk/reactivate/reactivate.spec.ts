import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as reactivateBulk } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => null,
  rateLimitByIp: () => null,
  getClientIp: () => "127.0.0.1",
}))

const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []

vi.mock("@/lib/db", () => {
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
    select: () => {
      throw new Error("select should not be called")
    },
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db }, pool: {} }
})

beforeEach(() => {
  updateResult.length = 0
  updatePayloads.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/merchants/bulk/reactivate", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "Warehouse Wan",
  userId: "u3",
}
const rider = { role: "RIDER", name: "Rider Rick", userId: "u4" }

describe("PATCH /api/merchants/bulk/reactivate", () => {
  it("401 when unauthenticated", async () => {
    const res = await reactivateBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await reactivateBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await reactivateBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await reactivateBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(403)
  })

  it("400 on missing ids body", async () => {
    sessionState.value = admin
    const res = await reactivateBulk(req({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 on empty ids array", async () => {
    sessionState.value = admin
    const res = await reactivateBulk(req({ ids: [] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("reactivates merchants, returns count, and logs audit per merchant", async () => {
    sessionState.value = admin
    updateResult.push(
      { id: "m_1", businessName: "Biz One", status: "ACTIVE" },
      { id: "m_2", businessName: "Biz Two", status: "ACTIVE" },
    )
    const res = await reactivateBulk(req({ ids: ["m_1", "m_2"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 2 })
    expect(updatePayloads[0]).toMatchObject({ status: "ACTIVE" })
    expect(logAudit).toHaveBeenCalledTimes(2)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_REACTIVATED",
        entityType: "merchant",
        entityId: "m_1",
      }),
    )
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_REACTIVATED",
        entityType: "merchant",
        entityId: "m_2",
      }),
    )
  })

  it("returns count 0 without audit when no rows matched", async () => {
    sessionState.value = admin
    const res = await reactivateBulk(req({ ids: ["m_missing"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 0 })
    expect(logAudit).not.toHaveBeenCalled()
  })
})
