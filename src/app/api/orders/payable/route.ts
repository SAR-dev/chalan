import { and, eq, gte, isNull, lte, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { deliveryCity, order } from "@/lib/db/schema"
import { paginateResponse, parsePagination } from "@/lib/pagination"
import { withErrorHandler } from "@/lib/with-error-handler"

const listColumns = {
  ...ORDER_CORE_COLUMNS,
  deliveredAt: order.deliveredAt,
}

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const requestedMerchantId = url.searchParams.get("merchantId")?.trim()
  const { limit, offset } = parsePagination(req)

  // Merchants can only ever see their own payable orders — a merchantId in
  // the query string must not let them (or any other non-admin role) read
  // another merchant's data. Only SUPER_ADMIN may look up an arbitrary
  // merchant via the query param.
  let merchantId: string | null
  if (me.role === "MERCHANT") {
    if (requestedMerchantId && requestedMerchantId !== me.merchantId) {
      return forbidden()
    }
    merchantId = me.merchantId ?? null
  } else if (me.role === "SUPER_ADMIN") {
    merchantId = requestedMerchantId ?? null
  } else {
    return forbidden()
  }

  if (!merchantId) {
    return NextResponse.json(paginateResponse([], 0))
  }

  const conditions = [
    eq(order.merchantId, merchantId),
    eq(order.status, "DELIVERED"),
    sql`${order.codSettledAt} is not null`,
    isNull(order.payoutRequestId),
  ]
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  if (from)
    conditions.push(gte(order.deliveredAt, new Date(from).toISOString()))
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(order.deliveredAt, end.toISOString()))
  }
  const where = and(...conditions)

  let rowsQuery = db
    .select(listColumns)
    .from(order)
    .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
    .where(where)
    .$dynamic()
  if (limit !== undefined) {
    rowsQuery = rowsQuery.limit(limit).offset(offset ?? 0)
  }

  const [[{ count, totalEarnings }], rows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        totalEarnings: sql<number>`coalesce(sum(${order.merchantEarnings}), 0)`,
      })
      .from(order)
      .where(where),
    rowsQuery,
  ])

  return NextResponse.json({
    ...paginateResponse(rows, count, limit, offset),
    totalEarnings: Number(totalEarnings ?? 0),
  })
})
