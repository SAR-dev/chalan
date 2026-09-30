// Deletes successfully-sent email log entries older than the configured
// retention period. FAILED entries are preserved for debugging.
//
// Intended to run on a schedule — once a day is enough since email logs
// accumulate slowly and the default retention is 10 days.
//
// Authentication: callers must supply the CRON_SECRET as a Bearer token.
// This prevents arbitrary clients from triggering the route.
//
// Retention is controlled by the EMAIL_LOG_RETENTION_DAYS env var (default: 10).
//
// Deployment options:
//   Vercel Cron — add to vercel.json; Vercel injects
//               Authorization: Bearer <CRON_SECRET> automatically.
//   Docker/VPS  — call with curl from crontab:
//               0 5 * * * curl -s -X POST https://your-domain/api/cron/cleanup-email-logs \
//                 -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1

import { and, eq, lt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { db } from "@/lib/db"
import { emailLog } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const retentionDays = parseInt(
    process.env.EMAIL_LOG_RETENTION_DAYS || "10",
    10,
  )
  const cutoff = sql`now() - interval '1 day' * ${retentionDays}`

  const deleted = await db
    .delete(emailLog)
    .where(and(eq(emailLog.status, "SENT"), lt(emailLog.createdAt, cutoff)))
    .returning({ id: emailLog.id })

  const result = {
    deletedEmailLogs: deleted.length,
    retentionDays,
    ranAt: new Date().toISOString(),
  }

  logger.info("cleanup-email-logs finished", result)
  return NextResponse.json(result)
})
