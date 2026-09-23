import { and, eq, gte, lte, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { parseDateRange } from "@/lib/pagination"

export async function GET(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const merchantId = url.searchParams.get("merchantId")
  const warehouseId = url.searchParams.get("warehouseId")

  // Build base where clause based on role
  let where = undefined
  if (me.role === "MERCHANT" && me.merchantId) {
    where = eq(order.merchantId, me.merchantId)
  } else if (me.role === "WAREHOUSE_ADMIN" && me.warehouseId) {
    where = eq(order.warehouseId, me.warehouseId)
  } else if (me.role === "SUPER_ADMIN") {
    if (merchantId) where = eq(order.merchantId, merchantId)
    else if (warehouseId) where = eq(order.warehouseId, warehouseId)
  }

  // Apply date range filter
  const dateRange = parseDateRange(req)
  if (dateRange) {
    const dateClause = and(
      gte(order.createdAt, dateRange.from.toISOString()),
      lte(order.createdAt, dateRange.to.toISOString()),
    )
    where = where ? and(where, dateClause) : dateClause
  }

  // 1. Orders by day (last 30 days or date range)
  const ordersByDay = await dbRead
    .select({
      date: sql<string>`date(${order.createdAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
      revenue: sql<number>`coalesce(sum(${order.merchantEarnings}), 0)`.as("revenue"),
    })
    .from(order)
    .where(where)
    .groupBy(sql`date(${order.createdAt})`)
    .orderBy(sql`date(${order.createdAt})`)

  // 2. Orders by status
  const ordersByStatus = await dbRead
    .select({
      status: order.status,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(order)
    .where(where)
    .groupBy(order.status)

  // 3. Delivery performance
  const [deliveryStats] = await dbRead
    .select({
      totalDelivered: sql<number>`count(*) filter (where ${order.status} = 'DELIVERED')`.as("totalDelivered"),
      totalFailed: sql<number>`count(*) filter (where ${order.status} = 'FAILED_ATTEMPT')`.as("totalFailed"),
      totalReturned: sql<number>`count(*) filter (where ${order.status} = 'RETURNED')`.as("totalReturned"),
      avgDeliveryTimeHours: sql<number>`coalesce(avg(extract(epoch from (${order.deliveredAt} - ${order.createdAt})) / 3600), 0)`.as("avgDeliveryTimeHours"),
    })
    .from(order)
    .where(where)
    .limit(1)

  const totalOutcome = (deliveryStats?.totalDelivered ?? 0) + (deliveryStats?.totalFailed ?? 0) + (deliveryStats?.totalReturned ?? 0)
  const successRate = totalOutcome > 0 ? ((deliveryStats?.totalDelivered ?? 0) / totalOutcome) * 100 : 0

  // 4. COD summary
  const [codSummary] = await dbRead
    .select({
      totalCollected: sql<number>`coalesce(sum(${order.productCost}) filter (where ${order.status} = 'DELIVERED'), 0)`.as("totalCollected"),
      totalSettled: sql<number>`coalesce(sum(${order.productCost}) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is not null), 0)`.as("totalSettled"),
      settledCount: sql<number>`count(*) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is not null)`.as("settledCount"),
      pendingCount: sql<number>`count(*) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is null)`.as("pendingCount"),
    })
    .from(order)
    .where(where)
    .limit(1)

  const pendingSettlement = (codSummary?.totalCollected ?? 0) - (codSummary?.totalSettled ?? 0)

  return NextResponse.json({
    ordersByDay,
    ordersByStatus,
    deliveryPerformance: {
      totalDelivered: deliveryStats?.totalDelivered ?? 0,
      totalFailed: deliveryStats?.totalFailed ?? 0,
      totalReturned: deliveryStats?.totalReturned ?? 0,
      successRate: Math.round(successRate * 10) / 10,
      avgDeliveryTimeHours: Math.round((deliveryStats?.avgDeliveryTimeHours ?? 0) * 10) / 10,
    },
    codSummary: {
      totalCollected: codSummary?.totalCollected ?? 0,
      totalSettled: codSummary?.totalSettled ?? 0,
      pendingSettlement,
      settledCount: codSummary?.settledCount ?? 0,
      pendingCount: codSummary?.pendingCount ?? 0,
    },
  })
}
