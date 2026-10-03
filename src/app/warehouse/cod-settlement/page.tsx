import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSession } from "@/lib/api-auth"
import { cachedStats, statTag } from "@/lib/cached-stats"
import { dbRead } from "@/lib/db"
import { sumMoney } from "@/lib/db/money-sql"
import { deliveryCity, order, rider } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { formatTk } from "@/lib/pricing"
import { WarehouseSettlementPageClient } from "./cod-settlement-client"

const ORDER_COLUMNS = {
  id: order.id,
  merchantId: order.merchantId,
  pickupLocationId: order.pickupLocationId,
  recipientName: order.recipientName,
  recipientPhone: order.recipientPhone,
  deliveryAddress: order.deliveryAddress,
  deliveryCity: deliveryCity.name,
  deliveryType: order.deliveryType,
  parcelWeightKg: order.parcelWeightKg,
  productCost: order.productCost,
  deliveryFee: order.deliveryFee,
  codFee: order.codFee,
  cancellationFee: order.cancellationFee,
  merchantEarnings: order.merchantEarnings,
  status: order.status,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  warehouseId: order.warehouseId,
  deliveryRiderId: order.deliveryRiderId,
  amountCollected: order.amountCollected,
  deliveryAttempts: order.deliveryAttempts,
  codSettledAt: order.codSettledAt,
  codSettledBy: order.codSettledBy,
}

/**
 * Outstanding COD cash per rider for one warehouse, cached.
 *
 * This is a money figure, so the caching is deliberately narrow: the scope is
 * the warehouse id (part of the key) and the set is "delivered, not yet handed
 * over" — a balance that only moves when an order is delivered or a settlement
 * is recorded, and both of those routes call `refreshStats`. The list total
 * below stays uncached, because a pagination footer that lags behind a delivery
 * is the one staleness a user would actually notice.
 */
const getRiderCashInHand = cachedStats(
  async (warehouseId: string) =>
    dbRead
      .select({
        riderId: order.deliveryRiderId,
        riderName: rider.name,
        cash: sumMoney(order.amountCollected),
        orders: sql<number>`count(*)::int`,
      })
      .from(order)
      .leftJoin(rider, eq(order.deliveryRiderId, rider.id))
      .where(
        and(
          eq(order.warehouseId, warehouseId),
          eq(order.status, "DELIVERED"),
          isNull(order.codSettledAt),
          isNotNull(order.deliveryRiderId),
        ),
      )
      .groupBy(order.deliveryRiderId, rider.name),
  { key: "warehouse-rider-cash", tags: [statTag("order"), statTag("rider")] },
)

export default async function WarehouseSettlementPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  // `order.warehouseId` is NOT NULL, so no "incoming candidate" can sit outside
  // This warehouse.
  const warehouseScope = eq(order.warehouseId, me.warehouseId)
  const statusFilter = eq(order.status, "DELIVERED")

  const [[{ total }], rows, riderCash] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(order)
      .where(and(warehouseScope, statusFilter)),
    dbRead
      .select(ORDER_COLUMNS)
      .from(order)
      .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
      .where(and(warehouseScope, statusFilter))
      .orderBy(desc(order.createdAt))
      .limit(limit),
    getRiderCashInHand(me.warehouseId),
  ])

  return (
    <div className="flex flex-col gap-6">
      {riderCash.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rider cash in hand</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {riderCash.map((r) => (
              <div
                key={r.riderId}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="font-medium">{r.riderName ?? r.riderId}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatTk(Number(r.cash ?? 0))} · {r.orders} order
                  {r.orders === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <WarehouseSettlementPageClient initialData={rows} initialTotal={total} />
    </div>
  )
}
