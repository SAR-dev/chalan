import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as review } from "./route"

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

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
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
  insertResult.length = 0
  insertPayloads.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function req(body?: unknown): Request {
  return new Request("http://test.local/api/admin/package-requests/pr_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: "pr_1" }) }

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const whAdmin = { role: "WAREHOUSE_ADMIN", name: "WH Walt", userId: "u2" }
const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u3",
  merchantId: "m_1",
}

const pendingRequest = {
  id: "pr_1",
  merchantId: "m_1",
  packageId: "pkg_1",
  amount: "1000.00",
  status: "PENDING",
}

describe("PATCH /api/admin/package-requests/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(403)
  })

  it("403 for a warehouse admin", async () => {
    sessionState.value = whAdmin
    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(403)
  })

  it("400 when the action is missing", async () => {
    sessionState.value = admin
    const res = await review(req({}), params)
    expect(res.status).toBe(400)
  })

  it("400 when the action is unknown", async () => {
    sessionState.value = admin
    const res = await review(req({ action: "archive" }), params)
    expect(res.status).toBe(400)
  })

  it("400 when rejecting without a reason", async () => {
    sessionState.value = admin
    const res = await review(req({ action: "reject", reason: "   " }), params)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toEqual([expect.objectContaining({ path: ["reason"] })])
  })

  it("400 when the action is unknown (schema union)", async () => {
    sessionState.value = admin
    const res = await review(req({ action: "delete" }), params)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues?.length).toBeGreaterThan(0)
  })

  it("404 when the request does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(404)
  })

  it("409 when the request was already reviewed", async () => {
    sessionState.value = admin
    selectQueue.push([{ ...pendingRequest, status: "APPROVED" }])
    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/already been reviewed/i)
  })

  it("reject stores the reason and writes no ledger row", async () => {
    sessionState.value = admin
    selectQueue.push([pendingRequest])
    updateResult.push({ ...pendingRequest, status: "REJECTED" })

    const res = await review(
      req({ action: "reject", reason: "  wrong package  " }),
      params,
    )
    expect(res.status).toBe(200)

    expect(updatePayloads[0]).toMatchObject({
      status: "REJECTED",
      reviewedBy: "Admin Amy",
      rejectReason: "wrong package",
    })
    expect(typeof updatePayloads[0].reviewedAt).toBe("string")
    expect(insertPayloads).toHaveLength(0)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_REQUEST_REJECTED" }),
    )
  })

  it("approve activates the bundle and credits the wallet", async () => {
    sessionState.value = admin
    selectQueue.push([pendingRequest])
    insertResult.push({ id: "mp_new", ordersUsed: 0, isActive: true })
    updateResult.push({ ...pendingRequest, status: "APPROVED" })

    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.merchantPackage).toMatchObject({ id: "mp_new" })

    // Any leftover active bundle is closed out first.
    expect(updatePayloads[0]).toMatchObject({ isActive: false })
    // The new bundle starts with a fresh quota.
    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      packageId: "pkg_1",
      ordersUsed: 0,
      isActive: true,
      assignedBy: "Admin Amy",
    })
    expect(updatePayloads[1]).toMatchObject({ status: "APPROVED" })
  })

  it("approve writes a negative PAYMENT_CONFIRMED ledger row", async () => {
    sessionState.value = admin
    selectQueue.push([pendingRequest])
    insertResult.push({ id: "mp_new" })
    updateResult.push({ ...pendingRequest, status: "APPROVED" })

    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(200)

    const ledger = insertPayloads.find((p) => p.type === "PAYMENT_CONFIRMED")
    // Credit → negative, matching a confirmed top-up's sign convention.
    expect(ledger).toMatchObject({
      merchantId: "m_1",
      amount: -1000,
      status: "SETTLED",
      paymentMethod: "PACKAGE",
      createdBy: "u1",
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_REQUEST_APPROVED" }),
    )
  })

  it("approve always negates a positive snapshot amount", async () => {
    sessionState.value = admin
    selectQueue.push([{ ...pendingRequest, amount: 750 }])
    insertResult.push({ id: "mp_new" })
    updateResult.push({ ...pendingRequest, status: "APPROVED" })

    const res = await review(req({ action: "approve" }), params)
    expect(res.status).toBe(200)
    const ledger = insertPayloads.find((p) => p.type === "PAYMENT_CONFIRMED")
    expect(ledger).toMatchObject({ amount: -750 })
  })
})
