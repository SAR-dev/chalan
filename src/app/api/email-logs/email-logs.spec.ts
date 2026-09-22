import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as markEmailSent } from "./[id]/route"
import { GET as listEmailLogs } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
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

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  sessionState.value = null
})

function req(method: string, url?: string): Request {
  return new Request(url ?? "http://test.local/api", { method })
}

function ctx(id = "log_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const merchantSession = { role: "MERCHANT", userId: "u2" }

describe("GET /api/email-logs", () => {
  it("401 when unauthenticated", async () => {
    const res = await listEmailLogs(req("GET"))
    expect(res.status).toBe(401)
  })

  it("non-admin returns empty", async () => {
    sessionState.value = merchantSession
    const res = await listEmailLogs(req("GET"))
    const json = await res.json()
    expect(json).toMatchObject({ data: [], total: 0 })
  })

  it("returns paginated email logs for admin", async () => {
    sessionState.value = admin
    selectQueue.push(
      [{ count: 1 }],
      [{ id: "log_1", to: "a@b.com", subject: "Welcome" }],
    )
    const res = await listEmailLogs(
      req("GET", "http://test.local/api?limit=10"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })
})

describe("PATCH /api/email-logs/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await markEmailSent(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await markEmailSent(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await markEmailSent(req("PATCH"), ctx())
    expect(res.status).toBe(404)
  })

  it("marks failed email as sent", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "log_1", status: "FAILED" }])
    updateResult.push({ id: "log_1", status: "SENT" })
    const res = await markEmailSent(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "SENT" })
  })
})
