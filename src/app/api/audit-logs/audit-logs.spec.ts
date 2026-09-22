import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as listAuditLogs } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []

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
  return { dbRead: { select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  sessionState.value = null
})

function req(method: string, url?: string): Request {
  return new Request(url ?? "http://test.local/api", { method })
}

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const merchantSession = { role: "MERCHANT", userId: "u2" }

describe("GET /api/audit-logs", () => {
  it("401 when unauthenticated", async () => {
    const res = await listAuditLogs(req("GET"))
    expect(res.status).toBe(401)
  })

  it("non-admin returns empty", async () => {
    sessionState.value = merchantSession
    const res = await listAuditLogs(req("GET"))
    const json = await res.json()
    expect(json).toMatchObject({ data: [], total: 0 })
  })

  it("returns paginated audit logs for admin", async () => {
    sessionState.value = admin
    selectQueue.push(
      [{ count: 1 }],
      [{ id: "log_1", action: "MERCHANT_APPROVED" }],
    )
    const res = await listAuditLogs(
      req("GET", "http://test.local/api?limit=10"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })
})
