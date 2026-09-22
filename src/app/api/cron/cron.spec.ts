import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as cleanupAuditLogs } from "./cleanup-audit-logs/route"
import { POST as cleanupEmailLogs } from "./cleanup-email-logs/route"
import { POST as cleanupSessions } from "./cleanup-sessions/route"

const CRON_SECRET = "test-secret-123"

vi.mock("@/lib/db", () => {
  const deleteChain = {
    where: () => deleteChain,
    returning: () => Promise.resolve([]),
  }
  return { db: { delete: () => deleteChain }, pool: {} }
})

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
})

function authReq(): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CRON_SECRET}`,
    },
  })
}

describe("POST /api/cron/cleanup-sessions", () => {
  it("401 when Authorization header is missing", async () => {
    const res = await cleanupSessions(
      new Request("http://test.local/api", { method: "POST" }),
    )
    expect(res.status).toBe(401)
  })

  it("returns deleted counts", async () => {
    const res = await cleanupSessions(authReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ deletedSessions: 0, deletedVerifications: 0 })
    expect(json).toHaveProperty("ranAt")
  })
})

describe("POST /api/cron/cleanup-audit-logs", () => {
  it("401 when Authorization header is missing", async () => {
    const res = await cleanupAuditLogs(
      new Request("http://test.local/api", { method: "POST" }),
    )
    expect(res.status).toBe(401)
  })

  it("returns deleted count with retention", async () => {
    const res = await cleanupAuditLogs(authReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ deletedAuditLogs: 0, retentionDays: 30 })
    expect(json).toHaveProperty("ranAt")
  })
})

describe("POST /api/cron/cleanup-email-logs", () => {
  it("401 when Authorization header is missing", async () => {
    const res = await cleanupEmailLogs(
      new Request("http://test.local/api", { method: "POST" }),
    )
    expect(res.status).toBe(401)
  })

  it("returns deleted count with retention", async () => {
    const res = await cleanupEmailLogs(authReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ deletedEmailLogs: 0, retentionDays: 10 })
    expect(json).toHaveProperty("ranAt")
  })
})
