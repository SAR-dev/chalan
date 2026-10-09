import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit, logAuditMany } from "@/lib/audit"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
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

// The approval transaction enqueues the approval email inside itself, so the
// mail + cache modules are stubbed too — this spec is about the approval
// contract, not the email transport.
vi.mock("@/lib/mail-templates", () => ({
  merchantApprovedTemplate: (_d: unknown) =>
    Promise.resolve({ subject: "Approved", text: "t", html: "<p>t</p>" }),
}))

vi.mock("@/lib/email-outbox", () => ({
  enqueueEmail: vi.fn(() => Promise.resolve()),
  flushEmailOutbox: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/cached-stats", () => ({
  refreshStats: vi.fn(),
  statTag: (t: string) => t,
}))

const selectQueue: unknown[][] = []
const returningQueue: unknown[][] = []
const updatePayloads: Record<string, unknown>[] = []
const insertPayloads: Record<string, unknown>[] = []

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
      // One row per call: a batch approves each merchant in its own
      // transaction, so the returning value differs per merchant.
      returning: () => Promise.resolve(returningQueue.shift() ?? []),
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
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(undefined).then(onFulfilled),
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
  returningQueue.length = 0
  updatePayloads.length = 0
  insertPayloads.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
  vi.mocked(logAuditMany).mockClear()
  vi.mocked(enqueueEmail).mockClear()
  vi.mocked(flushEmailOutbox).mockClear()
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

  it("400 when no PENDING merchants with verified email match the given IDs", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await approveBulk(req({ ids: ["m_1", "m_2"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    // The email-verification gate is the single route's rule too: a merchant who
    // has not proven their address cannot be activated by either surface.
    expect(json.error).toBe(
      "No PENDING merchants with verified email found for the given IDs.",
    )
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("approves only the PENDING subset and returns their count", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1" }, { id: "m_2" }])
    // Each merchant is approved in its own transaction, so `.returning()` is
    // called once per merchant.
    returningQueue.push([
      {
        id: "m_1",
        businessName: "Biz One",
        ownerName: "Owner One",
        email: "one@example.com",
      },
    ])
    returningQueue.push([
      {
        id: "m_2",
        businessName: "Biz Two",
        ownerName: "Owner Two",
        email: "two@example.com",
      },
    ])
    const res = await approveBulk(req({ ids: ["m_1", "m_2", "m_3"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 2 })
    // One approval email per merchant, enqueued inside that merchant's
    // transaction so an email can never describe an approval that rolled back.
    expect(enqueueEmail).toHaveBeenCalledTimes(2)
  })

  it("approves pending merchants, stamps approval fields, and logs audit", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1" }])
    returningQueue.push([
      {
        id: "m_1",
        businessName: "Biz One",
        ownerName: "Owner One",
        email: "one@example.com",
        status: "ACTIVE",
      },
    ])
    const res = await approveBulk(req({ ids: ["m_1"] }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(updatePayloads[0]).toMatchObject({
      status: "ACTIVE",
      approvedBy: "Admin Amy",
    })
    expect(typeof updatePayloads[0].approvedAt).toBe("string")
    expect(insertPayloads).toHaveLength(0)
    // One audit row per merchant, written inside the same transaction.
    expect(logAuditMany).not.toHaveBeenCalled()
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_APPROVED",
        entityType: "merchant",
        entityId: "m_1",
      }),
      expect.anything(),
    )
  })

  it("skips a merchant whose status changed underneath the batch", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1" }, { id: "m_2" }])
    // m_1 was suspended between the read and the write, so its guarded UPDATE
    // matches nothing and the batch reports it as skipped, not approved.
    returningQueue.push([])
    returningQueue.push([
      {
        id: "m_2",
        businessName: "Biz Two",
        ownerName: "Owner Two",
        email: "two@example.com",
      },
    ])
    const res = await approveBulk(req({ ids: ["m_1", "m_2"] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, count: 1 })
    expect(enqueueEmail).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledTimes(1)
  })
})
