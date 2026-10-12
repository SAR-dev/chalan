import { NextResponse } from "next/server"
import { noteCronInvocation, verifyCronAuth } from "@/lib/cron-auth"
import { logger } from "@/lib/logger"
import {
  runCleanupAuditLogs,
  runCleanupEmailLogs,
  runCleanupNotifications,
  runCleanupSessions,
  runCleanupUploads,
  runDrainEmailOutbox,
  runDrainWebhooks,
} from "@/lib/maintenance"
import { withErrorHandler } from "@/lib/with-error-handler"

// =============================================================================
// Combined maintenance run
//
// One entry point that drives all six jobs, for platforms whose cron quota is
// smaller than the job count. Vercel's free tier rejects a `vercel.json` with
// more crons than it allows (and with a sub-daily schedule), which failed the
// build outright — so the six routes became one registration here.
//
// The six individual routes are NOT removed: `docker/compose.cluster.yml` runs
// its own in-container crontab against them, and that scheduler can still
// afford per-minute drains. This route is for hosts that cannot.
//
// Consequence worth stating plainly: the two drains stop being per-minute here
// and run at this route's cadence instead. That is why webhook delivery was
// moved onto the write path (`flushWebhookDeliveries`) — it no longer depends
// on this cron being frequent. Email already flushed inline.
//
// Sequential, not parallel, on purpose: the jobs are independent but each is
// cheap, and serialising keeps the connection pool from being asked for six
// concurrent transactions on a serverless instance.
// =============================================================================

export const maxDuration = 60

interface JobResult {
  job: string
  ok: boolean
  detail: unknown
  error?: string
}

/**
 * Each job in its own `try` so one failure cannot strand the rest — a cleanup
 * that throws must not stop the outbox drain that runs after it.
 *
 * These call the job's library function rather than its HTTP route: going over
 * HTTP would mean re-authenticating and re-serialising six times to invoke
 * work this process already has in memory.
 */
const JOBS: Array<{
  name: string
  run: () => Promise<unknown>
}> = [
  { name: "drain-email-outbox", run: runDrainEmailOutbox },
  { name: "drain-webhooks", run: runDrainWebhooks },
  { name: "cleanup-sessions", run: runCleanupSessions },
  { name: "cleanup-audit-logs", run: runCleanupAuditLogs },
  { name: "cleanup-email-logs", run: runCleanupEmailLogs },
  { name: "cleanup-notifications", run: runCleanupNotifications },
  {
    name: "cleanup-uploads",
    run: () => runCleanupUploads({ dryRun: false }),
  },
]

export const POST = withErrorHandler(async (req: Request) => {
  // Verify without recording a `maintenance` heartbeat — each job reports under
  // its own name below, which is what `staleCronJobs` watches.
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: JobResult[] = []

  for (const { name, run } of JOBS) {
    try {
      const detail = await run()
      results.push({ job: name, ok: true, detail })
      noteCronInvocation(req, name)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      results.push({ job: name, ok: false, detail: null, error })
      logger.error("maintenance job failed", { job: name, err })
    }
  }

  const failed = results.filter((r) => !r.ok)

  logger.info("maintenance finished", {
    ranAt: new Date().toISOString(),
    jobs: results.length,
    failed: failed.length,
  })

  // 207 only when something failed: the run itself succeeded (most jobs ran),
  // and a scheduler that retries on a non-2xx is better served by a 500 that
  // says "partial" than by silence.
  return NextResponse.json(
    {
      ok: failed.length === 0,
      ranAt: new Date().toISOString(),
      results,
    },
    { status: failed.length === 0 ? 200 : 500 },
  )
})
