import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { logger } from "@/lib/logger"
import { runCleanupUploads } from "@/lib/maintenance"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"
  const swept = await runCleanupUploads({ dryRun })

  const result = { ...swept, ranAt: new Date().toISOString() }

  logger.info("cleanup-uploads finished", result)
  return NextResponse.json(result)
})
