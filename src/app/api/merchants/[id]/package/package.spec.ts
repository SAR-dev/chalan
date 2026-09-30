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
const insertPayloads: Record<string, unknown>[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      $dynamic: () => chain,
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
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return chain
      },
      where: () => chain,
    }
    return chain
  }
  const tx = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  }
  return {
    db: { transaction: (fn: (t: unknown) => unknown) => fn(tx) },
    pool: {},
  }
})

const admin = { userId: "u_admin", name: "Admin Amy", role: "SUPER_ADMIN" }
const merchantSession = { userId: "u_m", name: "Moe", role: "MERCHANT" }

function req(body: unknown = { packageId: "pkg_1" }): Request {
  return new Request("http://localhost:3000/api/merchants/m_1/package", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: "m_1" }) }

beforeEach(() => {
  selectQueue.length = 0
  insertPayloads.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

describe("POST /api/merchants/:id/package", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req(), ctx)
    expect(res.status).toBe(401)
  })

  it("403 for a non-admin role", async () => {
    sessionState.value = merchantSession
    const res = await POST(req(), ctx)
    expect(res.status).toBe(403)
  })

  it("404 when the package does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([]) // package lookup
    const res = await POST(req(), ctx)
    expect(res.status).toBe(404)
  })

  it("404 when the merchant does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "pkg_1", name: "Starter", isActive: true }])
    selectQueue.push([]) // merchant lookup
    const res = await POST(req(), ctx)
    expect(res.status).toBe(404)
  })

  it("closes any active bundle, inserts a fresh one and audits in-tx", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "pkg_1", name: "Starter", isActive: true }])
    selectQueue.push([{ id: "m_1", businessName: "Merchant One" }])
    insertResult.push({ id: "mp_new", ordersUsed: 0, isActive: true })

    const res = await POST(req(), ctx)

    expect(res.status).toBe(201)
    // The previous bundle is deactivated before the new one is inserted.
    expect(updatePayloads[0]).toMatchObject({ isActive: false })
    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      packageId: "pkg_1",
      ordersUsed: 0,
      isActive: true,
      assignedBy: "Admin Amy",
    })
    // A direct assign is not a payment: no ledger row is written.
    expect(insertPayloads.some((p) => p.type === "PAYMENT_CONFIRMED")).toBe(
      false,
    )
    // Stronger: the bundle row is the *only* insert, so the flow cannot be
    // quietly growing a ledger type of its own.
    expect(insertPayloads).toHaveLength(1)
    expect(insertPayloads[0]).not.toHaveProperty("type")
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_ASSIGNED" }),
      expect.anything(),
    )
  })

  it("400 when the body has no packageId", async () => {
    sessionState.value = admin
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(400)
  })
})
