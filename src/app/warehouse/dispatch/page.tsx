import { and, desc, eq, isNull, or, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { deliveryCity, order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseDispatchPageClient } from "./dispatch-client"

const ORDER_COLUMNS = {
  id: order.id,
  merchantId: order.merchantId,
  pickupLocationId: order.pickupLocationId,
  recipientName: order.recipientName,
  recipientPhone: order.recipientPhone,
  deliveryAddress: order.deliveryAddress,
  deliveryCity: deliveryCity.name,
  deliveryMapLink: order.deliveryMapLink,
  parcelWeightKg: order.parcelWeightKg,
  deliveryType: order.deliveryType,
  productCost: order.productCost,
  deliveryFee: order.deliveryFee,
  codFee: order.codFee,
  cancellationFee: order.cancellationFee,
  merchantEarnings: order.merchantEarnings,
  status: order.status,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  pickupRiderId: order.pickupRiderId,
  pickedUpAt: order.pickedUpAt,
  warehouseId: order.warehouseId,
  receivedAtWarehouseAt: order.receivedAtWarehouseAt,
  receivedByWarehouse: order.receivedByWarehouse,
  deliveryRiderId: order.deliveryRiderId,
  dispatchedAt: order.dispatchedAt,
  dispatchedBy: order.dispatchedBy,
  deliveredAt: order.deliveredAt,
  deliveryProofRef: order.deliveryProofRef,
  amountCollected: order.amountCollected,
  failedAttemptAt: order.failedAttemptAt,
  failureNote: order.failureNote,
  deliveryAttempts: order.deliveryAttempts,
  cancelledAt: order.cancelledAt,
  cancelledBy: order.cancelledBy,
  cancelReason: order.cancelReason,
  codSettledAt: order.codSettledAt,
  codSettledBy: order.codSettledBy,
  payoutRequestId: order.payoutRequestId,
}

export default async function WarehouseDispatchPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  const warehouseScope = or(
    eq(order.warehouseId, me.warehouseId),
    and(isNull(order.pickupRiderId), eq(order.status, "APPROVED")),
  )

  const [[{ total }], rows] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(order)
      .where(warehouseScope),
    dbRead
      .select(ORDER_COLUMNS)
      .from(order)
      .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
      .where(warehouseScope)
      .orderBy(desc(order.createdAt))
      .limit(limit),
  ])

  return <WarehouseDispatchPageClient initialData={rows} initialTotal={total} />
}
