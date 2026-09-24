import { and, desc, eq, isNotNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { order, rider } from "@/lib/db/schema"
import { cashOnHand } from "@/lib/rider-cash"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id } = await params

    const [riderRow] = await dbRead
      .select({
        id: rider.id,
        name: rider.name,
        warehouseId: rider.warehouseId,
      })
      .from(rider)
      .where(eq(rider.id, id))
      .limit(1)
    if (!riderRow) return notFound()

    if (me.role === "MERCHANT") return forbidden()
    if (me.role === "RIDER" && me.riderId !== id) return forbidden()
    if (
      me.role === "WAREHOUSE_ADMIN" &&
      riderRow.warehouseId !== me.warehouseId
    ) {
      return forbidden()
    }

    const riderScope = eq(order.deliveryRiderId, id)

    const [summary, delivered, settled] = await Promise.all([
      cashOnHand(dbRead, riderScope),
      dbRead
        .select({
          orderId: order.id,
          amountCollected: order.amountCollected,
          createdAt: order.deliveredAt,
        })
        .from(order)
        .where(
          and(
            riderScope,
            isNotNull(order.amountCollected),
            isNotNull(order.deliveredAt),
          ),
        )
        .orderBy(desc(order.deliveredAt))
        .limit(50),
      dbRead
        .select({
          orderId: order.id,
          amountCollected: order.amountCollected,
          confirmedAt: order.codSettledAt,
          confirmedBy: order.codSettledBy,
        })
        .from(order)
        .where(and(riderScope, isNotNull(order.codSettledAt)))
        .orderBy(desc(order.codSettledAt))
        .limit(50),
    ])

    const transactions = [
      ...delivered.map((o) => ({
        id: `${o.orderId}-collect`,
        riderId: id,
        orderId: o.orderId,
        type: "COLLECTED" as const,
        amount: o.amountCollected ?? 0,
        createdAt: o.createdAt,
        confirmedBy: null,
        confirmedAt: null,
      })),
      ...settled.map((o) => ({
        id: `${o.orderId}-confirm`,
        riderId: id,
        orderId: o.orderId,
        type: "CONFIRMED" as const,
        amount: o.amountCollected ?? 0,
        createdAt: o.confirmedAt,
        confirmedBy: o.confirmedBy,
        confirmedAt: o.confirmedAt,
      })),
    ]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 50)

    return NextResponse.json({
      riderId: id,
      riderName: riderRow.name,
      cash: {
        cashOnHand: summary.cashOnHand,
        totalCollected: summary.totalCollected,
        totalSubmitted: summary.totalSubmitted,
      },
      transactions,
    })
  },
)
