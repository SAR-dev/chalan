// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const { noted, authed } = vi.hoisted(() => ({
  noted: [] as Array<string | undefined>,
  authed: { ok: true as boolean },
}))

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: () => authed.ok,
  noteCronInvocation: (_req: unknown, job?: string) => {
    noted.push(job)
  },
}))

vi.mock("@/lib/maintenance", () => ({
  runDrainEmailOutbox: vi.fn(async () => ({ sent: 1, failed: 0 })),
  runDrainWebhooks: vi.fn(async () => ({ delivered: 2, failed: 0 })),
  runCleanupSessions: vi.fn(async () => ({ deletedSessions: 3 })),
  runCleanupAuditLogs: vi.fn(async () => ({ deletedAuditLogs: 4 })),
  runCleanupEmailLogs: vi.fn(async () => ({ deletedEmailLogs: 5 })),
  runCleanupUploads: vi.fn(async () => ({ deleted: 6 })),
}))

// `withErrorHandler` calls `logger.child(...)`, so a bare object is not enough.
vi.mock("@/lib/logger", () => {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  return { logger }
})

const JOBS = [
  "drain-email-outbox",
  "drain-webhooks",
  "cleanup-sessions",
  "cleanup-audit-logs",
  "cleanup-email-logs",
  "cleanup-uploads",
]

async function post() {
  const { POST } = await import("./route")
  return POST(
    new Request("http://localhost/api/cron/maintenance", {
      method: "POST",
    }),
  )
}

beforeEach(() => {
  noted.length = 0
  authed.ok = true
  vi.resetModules()
})

describe("POST /api/cron/maintenance", () => {
  it("401s without a valid cron secret", async () => {
    authed.ok = false
    const res = await post()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
  })

  it("runs every job and reports 200 when all succeed", async () => {
    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.results.map((r: { job: string }) => r.job)).toEqual(JOBS)
  })

  it("reports each job under its own name, not `maintenance`", async () => {
    // The heartbeat derives a job name from the URL by default. Without an
    // explicit name every row would say `maintenance`, and the watchdog's
    // per-job staleness check would go blind for all six.
    await post()
    expect(noted).toEqual(JOBS)
    expect(noted).not.toContain(undefined)
  })

  it("keeps going when one job throws, and fails the run", async () => {
    const { runCleanupSessions } = await import("@/lib/maintenance")
    vi.mocked(runCleanupSessions).mockRejectedValueOnce(
      new Error("relation does not exist"),
    )

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)

    const byJob = Object.fromEntries(
      body.results.map((r: { job: string; ok: boolean; error?: string }) => [
        r.job,
        r,
      ]),
    )
    // The failing job is reported...
    expect(byJob["cleanup-sessions"].ok).toBe(false)
    expect(byJob["cleanup-sessions"].error).toBe("relation does not exist")
    // ...and everything after it still ran.
    for (const job of JOBS.filter((j) => j !== "cleanup-sessions")) {
      expect(byJob[job].ok, `${job} was skipped`).toBe(true)
    }
  })

  it("records a heartbeat only for jobs that actually ran", async () => {
    const { runCleanupUploads } = await import("@/lib/maintenance")
    vi.mocked(runCleanupUploads).mockRejectedValueOnce(new Error("R2 down"))

    await post()
    expect(noted).not.toContain("cleanup-uploads")
    expect(noted).toContain("drain-webhooks")
  })

  it("never sweeps uploads in dry-run mode", async () => {
    const { runCleanupUploads } = await import("@/lib/maintenance")
    await post()
    expect(vi.mocked(runCleanupUploads)).toHaveBeenCalledWith({
      dryRun: false,
    })
  })
})
