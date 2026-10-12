import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as cleanupAuditLogs } from "./cleanup-audit-logs/route"
import { POST as cleanupEmailLogs } from "./cleanup-email-logs/route"
import { POST as cleanupNotifications } from "./cleanup-notifications/route"
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

describe("POST /api/cron/cleanup-notifications", () => {
  it("401 when Authorization header is missing", async () => {
    const res = await cleanupNotifications(
      new Request("http://test.local/api", { method: "POST" }),
    )
    expect(res.status).toBe(401)
  })

  it("reports both sweeps and the retention window", async () => {
    const res = await cleanupNotifications(authReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    // Two counts, not one: order rows and money rows are swept by different
    // predicates, so a single total could not tell which one emptied the inbox.
    expect(json).toMatchObject({
      deletedOrderEvents: 0,
      deletedMoneyEvents: 0,
      retentionDays: 14,
    })
    expect(json).toHaveProperty("ranAt")
  })

  it("honours NOTIFICATION_RETENTION_DAYS", async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = "7"
    try {
      const res = await cleanupNotifications(authReq())
      expect((await res.json()).retentionDays).toBe(7)
    } finally {
      delete process.env.NOTIFICATION_RETENTION_DAYS
    }
  })
})
