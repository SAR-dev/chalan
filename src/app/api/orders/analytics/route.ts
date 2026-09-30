import { and, eq, gte, lte, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { sumMoney, sumMoneyFiltered } from "@/lib/db/money-sql"
import { order } from "@/lib/db/schema"
import { businessDate } from "@/lib/db/time-sql"
import { parseDateRange } from "@/lib/pagination"
import { withErrorHandler } from "@/lib/with-error-handler"

const ANALYTICS_DEFAULT_WINDOW_DAYS = 30

/** Start (inclusive) of the default analytics window: now − 30 days, in UTC. */
function analyticsDefaultWindowStart(): string {
  return new Date(
    Date.now() - ANALYTICS_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const merchantId = url.searchParams.get("merchantId")
  const warehouseId = url.searchParams.get("warehouseId")

  // Build base where clause based on role
  let where
  if (me.role === "MERCHANT" && me.merchantId) {
    where = eq(order.merchantId, me.merchantId)
  } else if (me.role === "WAREHOUSE_ADMIN" && me.warehouseId) {
    where = eq(order.warehouseId, me.warehouseId)
  } else if (me.role === "SUPER_ADMIN") {
    if (merchantId) where = eq(order.merchantId, merchantId)
    else if (warehouseId) where = eq(order.warehouseId, warehouseId)
  } else if (me.role === "RIDER") {
    // A rider only ever sees analytics over their own deliveries/pickups —
    // never platform-wide aggregates. Without a rider binding the query can
    // never match anything.
    where = me.riderId
      ? or(
          eq(order.deliveryRiderId, me.riderId),
          eq(order.pickupRiderId, me.riderId),
        )
      : eq(order.id, "")
  }

  // Apply date range filter.
  //
  // Without an explicit range the endpoint used to aggregate over every order
  // ever created — an unbounded scan plus an unbounded `ordersByDay` series
  // (one row per business day since the table's creation). Default to the
  // documented "last 30 days" window instead (ROADMAP P3). Callers that
  // genuinely want a wider range still pass `from`/`to` explicitly.
  const dateRange = parseDateRange(req)
  const dateClause = dateRange
    ? and(
        gte(order.createdAt, dateRange.from.toISOString()),
        lte(order.createdAt, dateRange.to.toISOString()),
      )
    : gte(order.createdAt, analyticsDefaultWindowStart())
  where = where ? and(where, dateClause) : dateClause

  // 1. Orders by day (last 30 days or date range). The day is the business
  // (Asia/Dhaka) calendar day, not the DB session day (ROADMAP P1.3).
  // NOTE: Postgres returns bigint (count) and numeric (avg) as JS *strings*
  // through node-postgres. `sql<number>` is a TypeScript-only assertion and
  // does not coerce at runtime, so every aggregate must be cast explicitly —
  // otherwise Recharts receives strings and its path/axis math yields NaN,
  // rendering blank charts.
  const dayExpr = businessDate(order.createdAt)

  // All four aggregates share the same `where` and none depends on another, so
  // run them together instead of paying four sequential round trips.
  const [ordersByDay, ordersByStatus, deliveryRows, codRows] =
    await Promise.all([
      dbRead
        .select({
          date: dayExpr.as("date"),
          count: sql<number>`count(*)::int`.as("count"),
          revenue: sumMoney(order.merchantEarnings).as("revenue"),
        })
        .from(order)
        .where(where)
        .groupBy(dayExpr)
        .orderBy(dayExpr),

      // 2. Orders by status
      dbRead
        .select({
          status: order.status,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(order)
        .where(where)
        .groupBy(order.status),

      // 3. Delivery performance
      dbRead
        .select({
          totalDelivered:
            sql<number>`count(*) filter (where ${order.status} = 'DELIVERED')::int`.as(
              "totalDelivered",
            ),
          totalFailed:
            sql<number>`count(*) filter (where ${order.status} = 'FAILED_ATTEMPT')::int`.as(
              "totalFailed",
            ),
          totalReturned:
            sql<number>`count(*) filter (where ${order.status} = 'RETURNED')::int`.as(
              "totalReturned",
            ),
          avgDeliveryTimeHours:
            sql<number>`coalesce(avg(extract(epoch from (${order.deliveredAt} - ${order.createdAt})) / 3600), 0)::float`.as(
              "avgDeliveryTimeHours",
            ),
        })
        .from(order)
        .where(where)
        .limit(1),

      // 4. COD summary
      dbRead
        .select({
          totalCollected: sumMoneyFiltered(
            order.productCost,
            sql`${order.status} = 'DELIVERED'`,
          ).as("totalCollected"),
          totalSettled: sumMoneyFiltered(
            order.productCost,
            sql`${order.status} = 'DELIVERED' and ${order.codSettledAt} is not null`,
          ).as("totalSettled"),
          settledCount:
            sql<number>`count(*) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is not null)::int`.as(
              "settledCount",
            ),
          pendingCount:
            sql<number>`count(*) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is null)::int`.as(
              "pendingCount",
            ),
        })
        .from(order)
        .where(where)
        .limit(1),
    ])

  const deliveryStats = deliveryRows[0]
  const codSummary = codRows[0]

  const totalOutcome =
    (deliveryStats?.totalDelivered ?? 0) +
    (deliveryStats?.totalFailed ?? 0) +
    (deliveryStats?.totalReturned ?? 0)
  const successRate =
    totalOutcome > 0
      ? ((deliveryStats?.totalDelivered ?? 0) / totalOutcome) * 100
      : 0

  const pendingSettlement =
    (codSummary?.totalCollected ?? 0) - (codSummary?.totalSettled ?? 0)

  return NextResponse.json({
    ordersByDay,
    ordersByStatus,
    deliveryPerformance: {
      totalDelivered: deliveryStats?.totalDelivered ?? 0,
      totalFailed: deliveryStats?.totalFailed ?? 0,
      totalReturned: deliveryStats?.totalReturned ?? 0,
      successRate: Math.round(successRate * 10) / 10,
      avgDeliveryTimeHours:
        Math.round((deliveryStats?.avgDeliveryTimeHours ?? 0) * 10) / 10,
    },
    codSummary: {
      totalCollected: codSummary?.totalCollected ?? 0,
      totalSettled: codSummary?.totalSettled ?? 0,
      pendingSettlement,
      settledCount: codSummary?.settledCount ?? 0,
      pendingCount: codSummary?.pendingCount ?? 0,
    },
  })
})
