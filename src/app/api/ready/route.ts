// Readiness probe (ROADMAP P2.3). Unlike /api/health (liveness — 200 as soon as
// the process serves requests), this checks the dependencies a request needs:
//   - Postgres: `SELECT 1` on the primary pool,
//   - Redis: PING (only when REDIS_URL is configured; optional otherwise).
// Returns 503 when a required dependency is unreachable so load balancers /
// Docker healthchecks stop routing to the instance. Probes have a short
// timeout so a hung dependency cannot hang the healthcheck.
import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import {
  neverRanCronJobs,
  reportStaleCronJobs,
  staleCronJobs,
} from "@/lib/cron-heartbeat"
import { dbRead, pool } from "@/lib/db"
import { logger } from "@/lib/logger"
import { pingRedis, rateLimiterDegraded } from "@/lib/rate-limit"
import { withErrorHandler } from "@/lib/with-error-handler"

const PROBE_TIMEOUT_MS = 1500

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("probe timeout")), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export const GET = withErrorHandler(async () => {
  let db = false
  try {
    await withTimeout(dbRead.execute(sql`select 1`), PROBE_TIMEOUT_MS)
    db = true
  } catch (err) {
    logger.error("Readiness DB probe failed", { err })
  }

  const redis = await pingRedis(PROBE_TIMEOUT_MS)
  const ok = db && redis

  // Cron liveness is reported, but deliberately does NOT fail readiness: if
  // the scheduler dies the app itself is perfectly serviceable, and taking
  // every instance out of rotation would turn one background fault into an
  // outage. `reportStaleCronJobs` logs each lapse once instead of once per
  // probe (ROADMAP R0.8).
  let stale: string[] = []
  let neverRan: string[] = []
  if (db) {
    try {
      const staleJobs = await withTimeout(staleCronJobs(), PROBE_TIMEOUT_MS)
      reportStaleCronJobs(staleJobs)
      stale = staleJobs.map((s) => s.job)
      neverRan = await withTimeout(neverRanCronJobs(), PROBE_TIMEOUT_MS)
    } catch (err) {
      logger.debug("cron watchdog skipped", { err })
    }
  }

  return NextResponse.json(
    {
      ok,
      checks: { db, redis },
      rateLimiter: { degraded: rateLimiterDegraded() },
      // Pool saturation was invisible before (ROADMAP R3.1): when every
      // connection is checked out, requests queue behind `waitingCount` and
      // nothing in the app says so. `waiting > 0` sustained means the pool —
      // not the database — is the bottleneck.
      pool: {
        waiting: pool.waitingCount,
        total: pool.totalCount,
        max: pool.options.max,
      },
      cron: { stale, neverRan },
    },
    { status: ok ? 200 : 503 },
  )
})
