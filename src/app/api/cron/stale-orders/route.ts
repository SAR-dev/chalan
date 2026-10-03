// Flags orders that have been stuck in an actionable state for too long
//. Read-only monitoring: the counts are logged so ops can act
// (approve/cancel a stale PENDING order, return a stale FAILED_ATTEMPT parcel)
// without a schema flag. Auth: CRON_SECRET bearer token.

import { and, eq, lt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { dbRead } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/with-error-handler"

const STALE_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

async function countStale(
  column: typeof order.createdAt | typeof order.failedAttemptAt,
  status: "PENDING" | "FAILED_ATTEMPT" | "IN_WAREHOUSE",
  cutoff: string,
): Promise<number> {
  const [row] = await dbRead
    .select({ n: sql<number>`count(*)::int` })
    .from(order)
    .where(and(eq(order.status, status), lt(column, cutoff)))
  return Number(row?.n ?? 0)
}

export const GET = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - STALE_DAYS * DAY_MS).toISOString()

  const [pending, failedAttempt, inWarehouse] = await Promise.all([
    countStale(order.createdAt, "PENDING", cutoff),
    countStale(order.failedAttemptAt, "FAILED_ATTEMPT", cutoff),
    countStale(order.receivedAtWarehouseAt, "IN_WAREHOUSE", cutoff),
  ])

  const payload = {
    staleDays: STALE_DAYS,
    cutoff,
    pending,
    failedAttempt,
    inWarehouse,
    ranAt: new Date().toISOString(),
  }

  if (pending + failedAttempt + inWarehouse > 0) {
    logger.warn("Stale orders need attention", payload)
  }

  return NextResponse.json(payload)
})
