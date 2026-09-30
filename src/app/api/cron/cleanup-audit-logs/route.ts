// Deletes audit log entries older than the configured retention period.
//
// Intended to run on a schedule — once a day is enough since audit logs
// accumulate slowly and the default retention is 30 days.
//
// Authentication: callers must supply the CRON_SECRET as a Bearer token.
// This prevents arbitrary clients from triggering the route.
//
// Retention is controlled by the AUDIT_LOG_RETENTION_DAYS env var (default: 30).
//
// Deployment options:
//   Vercel Cron — add to vercel.json; Vercel injects
//               Authorization: Bearer <CRON_SECRET> automatically.
//   Docker/VPS  — call with curl from crontab:
//               0 4 * * * curl -s -X POST https://your-domain/api/cron/cleanup-audit-logs \
//                 -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1

import { lt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const retentionDays = parseInt(
    process.env.AUDIT_LOG_RETENTION_DAYS || "30",
    10,
  )
  const cutoff = sql`now() - interval '1 day' * ${retentionDays}`

  const deleted = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .returning({ id: auditLog.id })

  const result = {
    deletedAuditLogs: deleted.length,
    retentionDays,
    ranAt: new Date().toISOString(),
  }

  logger.info("cleanup-audit-logs finished", result)
  return NextResponse.json(result)
})
