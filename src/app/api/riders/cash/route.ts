import { asc, eq, type SQL, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { sumMoney, sumMoneyFiltered } from "@/lib/db/money-sql"
import { order, rider } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me) return unauthorized()

  if (me.role === "MERCHANT") return NextResponse.json([])
  if (me.role === "RIDER") return forbidden()

  let riderScope: SQL | undefined
  if (me.role === "WAREHOUSE_ADMIN") {
    if (!me.warehouseId) return NextResponse.json([])
    riderScope = eq(rider.warehouseId, me.warehouseId)
  }

  const rows = await dbRead
    .select({
      riderId: rider.id,
      riderName: rider.name,
      totalCollected: sumMoney(order.amountCollected),
      totalSubmitted: sumMoneyFiltered(
        order.amountCollected,
        sql`${order.codSettledAt} is not null`,
      ),
    })
    .from(rider)
    .leftJoin(order, eq(order.deliveryRiderId, rider.id))
    .where(riderScope)
    .groupBy(rider.id, rider.name)
    .orderBy(asc(rider.name))

  return NextResponse.json(
    rows.map((r) => ({
      riderId: r.riderId,
      riderName: r.riderName,
      totalCollected: r.totalCollected,
      totalSubmitted: r.totalSubmitted,
      cashOnHand: r.totalCollected - r.totalSubmitted,
    })),
  )
})
