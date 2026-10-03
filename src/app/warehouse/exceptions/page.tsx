import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { deliveryCity, order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseExceptionsPageClient } from "./exceptions-client"

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
  deliveryAttempts: order.deliveryAttempts,
  failedResolvedBy: order.failedResolvedBy,
  returnReason: order.returnReason,
}

export default async function WarehouseExceptionsPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  // `order.warehouseId` is NOT NULL, so no "incoming candidate" can sit outside
  // This warehouse.
  const warehouseScope = eq(order.warehouseId, me.warehouseId)
  const statusFilter = inArray(order.status, ["FAILED_ATTEMPT", "RETURNED"])

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
    <WarehouseExceptionsPageClient initialData={rows} initialTotal={total} />
  )
}
