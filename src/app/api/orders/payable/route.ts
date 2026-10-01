import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { DEFAULT_TABLE_ROWS_PER_PAGE } from "@/lib/constants"
import { dbRead as db } from "@/lib/db"
import { sumMoney } from "@/lib/db/money-sql"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { deliveryCity, order } from "@/lib/db/schema"
import { paginateResponse, parsePagination } from "@/lib/pagination"
import { businessRangeBound } from "@/lib/timezone"
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
  const { limit, offset } = parsePagination(req, {
    defaultLimit: DEFAULT_TABLE_ROWS_PER_PAGE,
  })

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
  const from = url.searchParams.get("from")?.trim()
  const to = url.searchParams.get("to")?.trim()
  if (from) {
    const bound = businessRangeBound(from, "start")
    if (bound) conditions.push(gte(order.deliveredAt, bound.toISOString()))
  }
  if (to) {
    const bound = businessRangeBound(to, "end")
    if (bound) conditions.push(lte(order.deliveredAt, bound.toISOString()))
  }
  const where = and(...conditions)

  let rowsQuery = db
    .select(listColumns)
    .from(order)
    .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
    .where(where)
    .$dynamic()
  // A total order is required, not just a sort. OFFSET paging over an unordered
  // set lets Postgres return rows in any order it likes, so page 1 and page 2
  // can overlap (the merchant sees the same order twice) or leave a gap (an
  // order is never shown at all) — a silent defect on a payout list.
  //
  // `createdAt` matches the house pattern (orders/route.ts, payouts, merchants)
  // and, critically, lines up with `order_merchant_status_created_at_idx`
  // (merchantId, status, createdAt) which the WHERE clause already satisfies, so
  // the index scan yields rows pre-sorted and no separate top-N sort is needed.
  // `deliveredAt` would be the more semantic choice but has no index. `id`
  // breaks ties: bulk-imported orders can share a `createdAt`, and a tie is
  // exactly where OFFSET paging starts duplicating rows.
  rowsQuery = rowsQuery.orderBy(desc(order.createdAt), desc(order.id))
  if (limit !== undefined) {
    rowsQuery = rowsQuery.limit(limit).offset(offset ?? 0)
  }

  const [[{ count, totalEarnings }], rows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
        totalEarnings: sumMoney(order.merchantEarnings),
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
