import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  knownCronJobs,
  neverRanCronJobs,
  noteCronInvocation,
  reportStaleCronJobs,
  resetStaleReportingForTests,
  type StaleJob,
  staleCronJobs,
} from "./cron-heartbeat"

const dbState = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  conflicts: [] as Record<string, unknown>[],
  rows: [] as Record<string, unknown>[],
  insertThrows: false,
}))

vi.mock("@/lib/db", () => ({
  db: {
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        if (dbState.insertThrows) throw new Error("no driver")
        dbState.inserted.push(v)
        return {
          onConflictDoUpdate: (u: Record<string, unknown>) => {
            dbState.conflicts.push(u)
            return Promise.resolve()
          },
        }
      },
    }),
    select: () => ({
      from: () => Promise.resolve(dbState.rows),
    }),
  },
  dbRead: {},
  pool: {},
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { logger } from "@/lib/logger"

function cronReq(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: "Bearer x" },
  })
}

beforeEach(() => {
  dbState.inserted.length = 0
  dbState.conflicts.length = 0
  dbState.rows = []
  dbState.insertThrows = false
  resetStaleReportingForTests()
  vi.mocked(logger.error).mockClear()
  vi.mocked(logger.debug).mockClear()
})

describe("noteCronInvocation", () => {
  it("derives the job from the cron path and upserts it", () => {
    noteCronInvocation(cronReq("/api/cron/cleanup-audit-logs"))
    expect(dbState.inserted).toHaveLength(1)
    expect(dbState.inserted[0].job).toBe("cleanup-audit-logs")
    // `ts()` columns are mode:"string" — an ISO string, not a Date.
    expect(typeof dbState.inserted[0].lastRanAt).toBe("string")
    expect(dbState.conflicts[0].target).toBeDefined()
  })

  it("ignores anything that is not a cron route", () => {
    noteCronInvocation(cronReq("/api/orders"))
    noteCronInvocation(cronReq("/api/cron"))
    expect(dbState.inserted).toHaveLength(0)
  })

  // A heartbeat exists to watch jobs, so a broken driver must never be able to
  // fail one. This is the exact case that made cleanup-uploads.spec return 500.
  it("swallows a synchronous failure without throwing", () => {
    dbState.insertThrows = true
    expect(() =>
      noteCronInvocation(cronReq("/api/cron/drain-email-outbox")),
    ).not.toThrow()
    expect(logger.debug).toHaveBeenCalled()
  })
})

describe("staleCronJobs", () => {
  const DAY = 24 * 60 * 60 * 1000

  it("reports a job that went quiet for more than twice its cadence", async () => {
    const now = Date.now()
    dbState.rows = [
      // minutely job, stale after 2 minutes
      {
        job: "drain-email-outbox",
        lastRanAt: new Date(now - 5 * 60_000).toISOString(),
      },
      // daily job, still fresh
      {
        job: "cleanup-sessions",
        lastRanAt: new Date(now - 6 * 60 * 60_000).toISOString(),
      },
    ]
    const stale = await staleCronJobs(now)
    expect(stale.map((s) => s.job)).toEqual(["drain-email-outbox"])
    expect(stale[0].staleAfterMs).toBe(120_000)
  })

  it("treats a daily job as stale once past two days", async () => {
    const now = Date.now()
    dbState.rows = [
      {
        job: "cleanup-audit-logs",
        lastRanAt: new Date(now - DAY * 3).toISOString(),
      },
    ]
    const stale = await staleCronJobs(now)
    expect(stale.map((s) => s.job)).toEqual(["cleanup-audit-logs"])
  })

  it("reports a never-run job with a null age", async () => {
    dbState.rows = [{ job: "cleanup-audit-logs", lastRanAt: null }]
    const stale = await staleCronJobs()
    expect(stale).toHaveLength(1)
    expect(stale[0].lastRanAt).toBeNull()
    expect(stale[0].ageMs).toBeNull()
  })
})

describe("neverRanCronJobs", () => {
  it("lists every scheduled job that has no heartbeat", async () => {
    dbState.rows = [{ job: "cleanup-sessions" }]
    const missing = await neverRanCronJobs()
    expect(missing).toContain("drain-email-outbox")
    expect(missing).not.toContain("cleanup-sessions")
    expect(missing).toEqual([...missing].sort())
  })

  it("knows every job the compose crontabs schedule", () => {
    // The watchdog's map and the actual scheduler must not drift; adding a job
    // to the crontab without teaching this module is the failure mode.
    const known = knownCronJobs()
    for (const job of [
      "drain-email-outbox",
      "cleanup-sessions",
      "cleanup-audit-logs",
      "cleanup-email-logs",
      "cleanup-uploads",
    ]) {
      expect(known, `missing cadence for ${job}`).toContain(job)
    }
  })
})

describe("reportStaleCronJobs", () => {
  const stale = (job: string): StaleJob => ({
    job,
    lastRanAt: "2026-01-01T00:00:00.000Z",
    ageMs: 10,
    staleAfterMs: 5,
  })

  // /api/ready is probed every few seconds — logging each time would bury the
  // alert under its own volume.
  it("logs a lapse once, not once per probe", () => {
    reportStaleCronJobs([stale("cleanup-sessions")])
    reportStaleCronJobs([stale("cleanup-sessions")])
    reportStaleCronJobs([stale("cleanup-sessions")])
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it("logs again after the job recovers and then lapses", () => {
    reportStaleCronJobs([stale("cleanup-sessions")])
    reportStaleCronJobs([])
    reportStaleCronJobs([stale("cleanup-sessions")])
    expect(logger.error).toHaveBeenCalledTimes(2)
  })
})
