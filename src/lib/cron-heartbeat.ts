import { db } from "@/lib/db"
import { cronRun } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

// =============================================================================
// Cron heartbeat
//
// Nothing used to notice when cron stopped: every job logged at most an
// `info` line, the cron container had no healthcheck, and its output went to a
// file inside an ephemeral container. If the scheduler died, the app kept
// serving — retention sweeps, outbox drains and the stale-order alert simply
// stopped happening with no signal.
//
// Each invocation now upserts one row per job, so "is the scheduler alive?"
// is `max(lastRanAt)` per job. One row per job, not one per run, so
// `drain-email-outbox` firing every minute costs nothing.
//
// Recording deliberately hangs off `isAuthorizedCron` rather than each route:
// that function is the single gate all six cron routes already pass, so the
// job name is derivable from the request URL and no route has to remember to
// report in — which is how the whole point of this table would otherwise be
// lost to a forgotten call site.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Expected cadence per job, taken from the actual schedules in
 * `docker/compose.cluster.yml` / `vercel.json`. An unknown job is assumed
 * daily — the conservative reading, so a new job is never declared stale
 * merely because nobody added it here.
 *
 * The two drains default to per-minute, which is what the compose crontab
 * schedules. `CRON_DRAIN_CADENCE_MS` overrides them for hosts that collapse all
 * six jobs into `/api/cron/maintenance` on a coarser schedule — Vercel's free
 * tier permits only daily crons — where leaving these at 60s would have the
 * watchdog report both as stale on every readiness probe.
 */
const drainCadence = Number(process.env.CRON_DRAIN_CADENCE_MS) || 60_000

const CADENCE_MS: Record<string, number> = {
  "drain-email-outbox": drainCadence,
  "drain-webhooks": drainCadence,
  "cleanup-sessions": DAY_MS,
  "cleanup-audit-logs": DAY_MS,
  "cleanup-email-logs": DAY_MS,
  "cleanup-uploads": DAY_MS,
}

/** A job is stale once it is this many cadences past its last run. */
const STALE_MULTIPLIER = 2

function jobFromRequest(req: Request): string | null {
  try {
    const path = new URL(req.url).pathname
    const segment = path.split("/").filter(Boolean).pop()
    // `/api/cron/<job>` — anything else is not a scheduled job.
    return segment && path.includes("/api/cron/") ? segment : null
  } catch {
    return null
  }
}

/**
 * Upsert this job's heartbeat. Fire-and-forget: a failure to record must never
 * fail the job it is recording.
 *
 * `job` overrides the name derived from the URL. The combined maintenance route
 * drives six jobs through one path, so without this every one of them would
 * report as `maintenance` — and `staleCronJobs`/`neverRanCronJobs` would go
 * permanently blind for the five real job names.
 *
 * Both sync and async failures are swallowed. The sync case is not theoretical
 * — `cleanup-uploads.spec.ts` mocks `db` as `{}`, so `db.insert(...)` throws
 * before any promise exists, and `.catch()` alone would have turned a
 * swallowed heartbeat into a 500 on the route it was watching.
 */
export function noteCronInvocation(req: Request, job?: string): void {
  const name = job ?? jobFromRequest(req)
  if (!name) return

  // `ts()` columns are `mode: "string"`, so timestamps travel as ISO strings.
  const nowIso = new Date().toISOString()
  try {
    void db
      .insert(cronRun)
      .values({
        job: name,
        lastRanAt: nowIso,
        updatedAt: nowIso,
        ok: true,
      })
      .onConflictDoUpdate({
        target: cronRun.job,
        set: { lastRanAt: nowIso, updatedAt: nowIso, ok: true },
      })
      .then(() => undefined)
      .catch((err: unknown) => {
        logger.debug("cron heartbeat not recorded", { job: name, err })
      })
  } catch (err) {
    logger.debug("cron heartbeat not recorded", { job: name, err })
  }
}

export interface StaleJob {
  job: string
  lastRanAt: string | null
  /** Milliseconds since the last run, or `null` when the job never ran. */
  ageMs: number | null
  /** How long it may go quiet before that counts as stale. */
  staleAfterMs: number
}

/**
 * Jobs that should have run by now but have not.
 *
 * A job with no row at all is reported with `lastRanAt: null` — that is
 * genuinely "never seen", which on a fresh deploy is expected and on a
 * production box running for weeks means the schedule was never installed.
 */
export async function staleCronJobs(now = Date.now()): Promise<StaleJob[]> {
  const rows = await db.select().from(cronRun)

  return rows
    .map((row) => {
      const cadence = CADENCE_MS[row.job] ?? DAY_MS
      const staleAfterMs = cadence * STALE_MULTIPLIER
      // `ts()` columns come back as ISO strings, not `Date`s.
      const lastRanAtMs = row.lastRanAt ? Date.parse(row.lastRanAt) : null
      return {
        job: row.job,
        lastRanAt: row.lastRanAt ?? null,
        ageMs:
          lastRanAtMs === null || Number.isNaN(lastRanAtMs)
            ? null
            : now - lastRanAtMs,
        staleAfterMs,
      }
    })
    .filter((s) => s.ageMs === null || s.ageMs > s.staleAfterMs)
    .sort(
      (a, b) =>
        (b.ageMs ?? Number.MAX_SAFE_INTEGER) -
        (a.ageMs ?? Number.MAX_SAFE_INTEGER),
    )
}

/** Jobs expected by the scheduler that have never reported in. */
export async function neverRanCronJobs(): Promise<string[]> {
  const rows = await db.select({ job: cronRun.job }).from(cronRun)
  const seen = new Set(rows.map((r) => r.job))
  const all = Object.keys(CADENCE_MS)
  return all.filter((job) => !seen.has(job)).sort()
}

/**
 * Log each stale job at most once per transition.
 *
 * `/api/ready` is probed every few seconds by the healthcheck, so without this
 * a dead scheduler would flood the log at probe frequency — the alert would
 * bury itself.
 */
const alreadyReported = new Set<string>()

export function reportStaleCronJobs(stale: StaleJob[]): void {
  for (const s of stale) {
    if (alreadyReported.has(s.job)) continue
    alreadyReported.add(s.job)
    logger.error("Cron job is stale — the scheduler may have stopped", {
      job: s.job,
      ageMs: s.ageMs,
      staleAfterMs: s.staleAfterMs,
      lastRanAt: s.lastRanAt,
    })
  }
  // Clear jobs that recovered, so a later lapse is reported again.
  const staleSet = new Set(stale.map((s) => s.job))
  for (const job of [...alreadyReported]) {
    if (!staleSet.has(job)) alreadyReported.delete(job)
  }
}

/** Test seam: forget which lapses have already been reported. */
export function resetStaleReportingForTests(): void {
  alreadyReported.clear()
}

/** The job names this module knows how to schedule. */
export function knownCronJobs(): string[] {
  return Object.keys(CADENCE_MS).sort()
}

export { CADENCE_MS, STALE_MULTIPLIER }
