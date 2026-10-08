// Delivers queued order webhooks (R2).
//
// An order transition writes a `webhook_delivery` row in the same transaction
// as the state change; this route claims those rows, signs each payload and
// POSTs it to the merchant's endpoint. A crash or a frozen serverless
// invocation can leave rows behind, which is what this exists for.
//
// Authentication: callers must supply the CRON_SECRET as a Bearer token.
//
// Deployment: run every minute from the cron container (or Vercel Cron). The
// claim uses `FOR UPDATE SKIP LOCKED`, so overlapping runs are safe. There are
// no retries — a failed delivery parks as FAILED and the merchant reconciles
// against `/api/v1/orders`; see `src/lib/webhooks.ts` for why that is a
// deliberate difference from the email outbox.

import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { logger } from "@/lib/logger"
import { drainWebhooks } from "@/lib/webhooks"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await drainWebhooks({ limit: 50 })
  const payload = { ...result, ranAt: new Date().toISOString() }
  logger.info("drain-webhooks finished", payload)
  return NextResponse.json(payload)
})
