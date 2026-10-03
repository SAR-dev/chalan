import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit, logAuditMany } from "@/lib/audit"
import { PATCH as approveBulk } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
  logAuditMany: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => null,
  rateLimitByIp: () => null,
  getClientIp: () => "127.0.0.1",
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
  return new Request("http://test.local/api/merchants/bulk/approve", {
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

describe("PATCH /api/merchants/bulk/approve", () => {
  it("401 when unauthenticated", async () => {
    const res = await approveBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await approveBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await approveBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = rider
    const res = await approveBulk(req({ ids: ["m_1"] }))
    expect(res.status).toBe(403)
  })

  it("400 on missing ids body", async () => {
    sessionState.value = admin
    const res = await approveBulk(req({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 on empty ids array", async () => {
    sessionState.value = admin
    const res = await approveBulk(req({ ids: [] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 when no PENDING merchants found for the given IDs", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await approveBulk(req({ ids: ["m_1", "m_2"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("No PENDING merchants found for the given IDs.")
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("approves only the PENDING subset and returns their count", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1" }, { id: "m_2" }])
    updateResult.push(
      { id: "m_1", businessName: "Biz One" },
      { id: "m_2", businessName: "Biz Two" },
    )
    const res = await approveBulk(req({ ids: ["m_1", "m_2", "m_3"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 2 })
  })

  it("approves pending merchants, stamps approval fields, and logs audit", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1" }])
    updateResult.push({ id: "m_1", businessName: "Biz One", status: "ACTIVE" })
    const res = await approveBulk(req({ ids: ["m_1"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "ACTIVE",
      approvedBy: "Admin Amy",
    })
    expect(typeof updatePayloads[0].approvedAt).toBe("string")
    // One batched insert instead of one per row — the payload
    // contract is unchanged, it just arrives as an array.
    expect(logAudit).not.toHaveBeenCalled()
    expect(logAuditMany).toHaveBeenCalledTimes(1)
    const [auditRows] = vi.mocked(logAuditMany).mock.calls[0]
    expect(auditRows).toContainEqual(
      expect.objectContaining({
        action: "MERCHANT_APPROVED",
        entityType: "merchant",
        entityId: "m_1",
      }),
    )
  })
})
