import { and, desc, eq, isNull, or, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { deliveryCity, order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
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

export default async function WarehouseSettlementPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  const warehouseScope = or(
    eq(order.warehouseId, me.warehouseId),
    and(isNull(order.warehouseId), eq(order.status, "PICKED_UP")),
  )
  const statusFilter = eq(order.status, "DELIVERED")

  const [[{ total }], rows] = await Promise.all([
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
  ])

  return (
    <WarehouseSettlementPageClient initialData={rows} initialTotal={total} />
  )
}
