import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { GET, POST } from "./route"

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
      innerJoin: () => chain,
      leftJoin: () => chain,
      $dynamic: () => chain,
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
    update: () => ({ set: () => ({ where: () => ({ returning: () => [] }) }) }),
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
  return new Request("http://test.local/api/packages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const rider = { role: "RIDER", name: "Rider Rick", userId: "u3" }

const starter = {
  id: "pkg_1",
  name: "Starter",
  price: "1000.00",
  isActive: true,
}
const retired = { ...starter, id: "pkg_2", name: "Retired", isActive: false }

describe("GET /api/packages", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("403 for a rider", async () => {
    sessionState.value = rider
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("admin sees inactive packages too", async () => {
    sessionState.value = admin
    selectQueue.push([starter, retired])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.packages).toHaveLength(2)
  })

  it("a merchant only sees active packages", async () => {
    sessionState.value = merchant
    selectQueue.push([starter, retired])
    selectQueue.push([{ id: "t_1", packageId: "pkg_1" }])
    selectQueue.push([]) // active bundle
    selectQueue.push([]) // latest request
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.packages).toHaveLength(1)
    expect(json.packages[0].id).toBe("pkg_1")
    // Tiers are nested onto their package for the catalogue card.
    expect(json.packages[0].tiers).toHaveLength(1)
  })

  it("a merchant gets their active bundle and latest request", async () => {
    sessionState.value = merchant
    selectQueue.push([starter])
    selectQueue.push([{ id: "t_1", packageId: "pkg_1" }])
    selectQueue.push([{ id: "mp_1", packageId: "pkg_1", ordersUsed: 3 }])
    selectQueue.push([{ id: "pr_2", status: "PENDING" }])
    const res = await GET()
    const json = await res.json()
    expect(json.activePackage).toMatchObject({ id: "mp_1", ordersUsed: 3 })
    // The newest request decides what the merchant sees — an old settled row
    // must never strand them in a permanent "awaiting review" state.
    expect(json.latestRequest).toMatchObject({ id: "pr_2", status: "PENDING" })
  })
})

describe("POST /api/packages", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req({ name: "Starter", price: 1000 }))
    expect(res.status).toBe(401)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await POST(req({ name: "Starter", price: 1000 }))
    expect(res.status).toBe(403)
  })

  it("400 when the name is blank", async () => {
    sessionState.value = admin
    const res = await POST(req({ name: "   ", price: 1000 }))
    expect(res.status).toBe(400)
  })

  it("400 when the price is negative", async () => {
    sessionState.value = admin
    const res = await POST(req({ name: "Starter", price: -5 }))
    expect(res.status).toBe(400)
  })

  it("201 creates an active package by default", async () => {
    sessionState.value = admin
    insertResult.push({ id: "pkg_9", name: "Starter", price: "1000.00" })
    const res = await POST(req({ name: "  Starter  ", price: 1000 }))
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      name: "Starter",
      price: 1000,
      isActive: true,
      createdBy: "Admin Amy",
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PACKAGE_CREATED" }),
    )
  })

  it("201 honours an explicit inactive flag", async () => {
    sessionState.value = admin
    insertResult.push({ id: "pkg_9" })
    const res = await POST(
      req({ name: "Draft", price: 0, isActive: false, description: "  " }),
    )
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      isActive: false,
      description: null,
    })
  })
})
