// Drains the transactional email outbox (ROADMAP P1.5).
//
// Domain writes persist an `email_outbox` row in the same transaction as the
// change; the request also tries to flush immediately, but a crash or a frozen
// serverless invocation can leave rows behind. This route delivers them.
//
// Authentication: callers must supply the CRON_SECRET as a Bearer token.
//
// Deployment: run every minute from the cron container (or Vercel Cron). The
// claim uses `FOR UPDATE SKIP LOCKED`, so overlapping runs are safe.

import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { drainEmailOutbox } from "@/lib/email-outbox"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await drainEmailOutbox({ limit: 50 })
  const payload = { ...result, ranAt: new Date().toISOString() }
  logger.info("drain-email-outbox finished", payload)
  return NextResponse.json(payload)
})
