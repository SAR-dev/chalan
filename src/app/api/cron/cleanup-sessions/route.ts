import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { logger } from "@/lib/logger"
import { runCleanupSessions } from "@/lib/maintenance"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = {
    ...(await runCleanupSessions()),
    ranAt: new Date().toISOString(),
  }

  logger.info("cleanup-sessions finished", result)
  return NextResponse.json(result)
})
