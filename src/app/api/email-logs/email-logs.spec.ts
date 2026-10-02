import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getEmailLog, PATCH as markEmailSent } from "./[id]/route"
import { PATCH as bulkMarkSent } from "./bulk/mark-sent/route"
import { GET as listEmailLogs } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const { logAuditMock, logAuditManyMock } = vi.hoisted(() => ({
  logAuditMock: vi.fn(() => Promise.resolve()),
  // Typed with its real parameter so `mock.calls[0][0]` indexes the row array
  // rather than an empty tuple.
  logAuditManyMock: vi.fn((_rows: unknown[]) => Promise.resolve()),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: logAuditMock,
  logAuditMany: logAuditManyMock,
}))

const selectQueue: unknown[][] = []
const selectCalls: unknown[] = []
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
  const recordSelect = (fields?: unknown) => {
    if (fields !== undefined) selectCalls.push(fields)
    return makeSelectChain()
  }
  const db = {
    select: recordSelect,
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db, select: recordSelect }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  selectCalls.length = 0
  updateResult.length = 0
  sessionState.value = null
  logAuditMock.mockClear()
  logAuditManyMock.mockClear()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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

  it("omits the html/plain bodies from list rows (ROADMAP P3)", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 1 }], [{ id: "log_1" }])
    const res = await listEmailLogs(
      req("GET", "http://test.local/api?limit=10"),
    )
    expect(res.status).toBe(200)
    // The list projection must not ask the DB for the bodies at all.
    const listProjection = selectCalls[0] as Record<string, unknown>
    expect(Object.keys(listProjection)).not.toContain("body")
    expect(Object.keys(listProjection)).not.toContain("textBody")
    expect(Object.keys(listProjection)).toContain("subject")
  })
})

describe("GET /api/email-logs/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await getEmailLog(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await getEmailLog(req("GET"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await getEmailLog(req("GET"), ctx())
    expect(res.status).toBe(404)
  })

  it("returns the full record including the plain-text body", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "log_1",
        to: "a@b.com",
        subject: "Welcome",
        textBody: "Hi",
      },
    ])
    const res = await getEmailLog(req("GET"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ textBody: "Hi" })
    expect(json).not.toHaveProperty("body")
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

describe("PATCH /api/email-logs/bulk/mark-sent", () => {
  it("401 when unauthenticated", async () => {
    const res = await bulkMarkSent(req("PATCH", undefined, { ids: ["log_1"] }))
    expect(res.status).toBe(401)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await bulkMarkSent(req("PATCH", undefined, { ids: ["log_1"] }))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body with issues", async () => {
    sessionState.value = admin
    const res = await bulkMarkSent(req("PATCH", undefined, {}))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 when empty ids array", async () => {
    sessionState.value = admin
    const res = await bulkMarkSent(req("PATCH", undefined, { ids: [] }))
    expect(res.status).toBe(400)
  })

  it("400 when no FAILED entries match the given IDs", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await bulkMarkSent(req("PATCH", undefined, { ids: ["log_1"] }))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain("No FAILED entries")
    expect(logAuditMock).not.toHaveBeenCalled()
  })

  it("marks failed emails as sent and audits each", async () => {
    sessionState.value = admin
    selectQueue.push([
      { id: "log_1", to: "a@b.com", subject: "Welcome", status: "FAILED" },
      { id: "log_2", to: "c@d.com", subject: "Reset", status: "FAILED" },
    ])
    const res = await bulkMarkSent(
      req("PATCH", undefined, { ids: ["log_1", "log_2"] }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, count: 2 })
    // Both rows land in one insert rather than one per row.
    expect(logAuditMock).not.toHaveBeenCalled()
    expect(logAuditManyMock).toHaveBeenCalledTimes(1)
    const [auditRows] = logAuditManyMock.mock.calls[0]
    expect(auditRows).toHaveLength(2)
    expect(auditRows).toContainEqual(
      expect.objectContaining({
        action: "EMAIL_LOG_MARKED_SENT",
        entityType: "email_log",
        entityId: "log_1",
      }),
    )
    expect(auditRows).toContainEqual(
      expect.objectContaining({
        action: "EMAIL_LOG_MARKED_SENT",
        entityType: "email_log",
        entityId: "log_2",
      }),
    )
  })
})
