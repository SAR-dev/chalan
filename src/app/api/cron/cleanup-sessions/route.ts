// Deletes expired sessions and verification tokens from the database.
//
// Intended to run on a schedule — once a day is enough since sessions expire
// after 7 days (lib/auth.ts expiresIn) and verification tokens are short-lived.
//
// Authentication: callers must supply the CRON_SECRET as a Bearer token.
// This prevents arbitrary clients from triggering the route.
//
// Deployment options:
//   Vercel Cron — add to vercel.json (see below); Vercel injects
//               Authorization: Bearer <CRON_SECRET> automatically.
//   Docker/VPS  — call with curl from crontab:
//               0 3 * * * curl -s -X POST https://your-domain/api/cron/cleanup-sessions \
//                 -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1

import { lt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { db } from "@/lib/db"
import { session, verification } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = sql`now()`

  const [deletedSessions, deletedVerifications] = await Promise.all([
    db
      .delete(session)
      .where(lt(session.expiresAt, now))
      .returning({ id: session.id }),
    db
      .delete(verification)
      .where(lt(verification.expiresAt, now))
      .returning({ id: verification.id }),
  ])

  const result = {
    deletedSessions: deletedSessions.length,
    deletedVerifications: deletedVerifications.length,
    ranAt: new Date().toISOString(),
  }

  console.log("[cron/cleanup-sessions]", result)
  return NextResponse.json(result)
})
