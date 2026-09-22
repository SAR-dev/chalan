import { and, eq, isNull, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { paginateResponse } from "@/lib/pagination"

const listColumns = {
  id: order.id,
  merchantId: order.merchantId,
  recipientName: order.recipientName,
  deliveryCity: order.deliveryCity,
  productCost: order.productCost,
  merchantEarnings: order.merchantEarnings,
  status: order.status,
  codSettledAt: order.codSettledAt,
  deliveredAt: order.deliveredAt,
  createdAt: order.createdAt,
}

export async function GET(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const requestedMerchantId = url.searchParams.get("merchantId")?.trim()

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

  const where = and(
    eq(order.merchantId, merchantId),
    eq(order.status, "DELIVERED" as any),
    sql`${order.codSettledAt} is not null`,
    isNull(order.payoutRequestId),
  )

  const [[{ count }], rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(order).where(where),
    db.select(listColumns).from(order).where(where),
  ])

  return NextResponse.json(paginateResponse(rows, count))
}
