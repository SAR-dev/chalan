import { and, eq, isNull, or } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { notFound, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { deliveryCity, order } from "@/lib/db/schema"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { id } = await params

  // Build the same role-based scope as the list endpoint.
  let scope
  switch (me.role) {
    case "MERCHANT":
      if (!me.merchantId) return notFound()
      scope = eq(order.merchantId, me.merchantId)
      break
    case "RIDER":
      if (!me.riderId) return notFound()
      scope = or(
        eq(order.pickupRiderId, me.riderId),
        eq(order.deliveryRiderId, me.riderId),
      )
      break
    case "WAREHOUSE_ADMIN":
      if (!me.warehouseId) return notFound()
      // Mirror the list endpoint: warehouse-assigned orders OR picked-up
      // parcels not yet assigned to any warehouse (incoming candidates).
      scope = or(
        eq(order.warehouseId, me.warehouseId),
        and(isNull(order.warehouseId), eq(order.status, "PICKED_UP")),
      )
      break
    case "SUPER_ADMIN":
      scope = undefined
      break
    default:
      return notFound()
  }

  const conditions = [eq(order.id, id)]
  if (scope) conditions.push(scope)

  const [row] = await db
    .select({
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
      merchantEarnings: order.merchantEarnings,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      approvedBy: order.approvedBy,
      approvedAt: order.approvedAt,
      pickupRiderId: order.pickupRiderId,
      assignedAt: order.assignedAt,
      pickedUpAt: order.pickedUpAt,
      pickupProofRefs: order.pickupProofRefs,
      warehouseId: order.warehouseId,
      receivedAtWarehouseAt: order.receivedAtWarehouseAt,
      receivedByWarehouse: order.receivedByWarehouse,
      deliveryRiderId: order.deliveryRiderId,
      dispatchedAt: order.dispatchedAt,
      dispatchedBy: order.dispatchedBy,
      outForDeliveryAt: order.outForDeliveryAt,
      deliveredAt: order.deliveredAt,
      deliveryProofRef: order.deliveryProofRef,
      amountCollected: order.amountCollected,
      failedAttemptAt: order.failedAttemptAt,
      failureNote: order.failureNote,
      deliveryAttempts: order.deliveryAttempts,
      failedResolvedAt: order.failedResolvedAt,
      failedResolvedBy: order.failedResolvedBy,
      returnedAt: order.returnedAt,
      returnReason: order.returnReason,
      cancelledAt: order.cancelledAt,
      cancelledBy: order.cancelledBy,
      cancelReason: order.cancelReason,
      merchantNote: order.merchantNote,
      receiverNote: order.receiverNote,
      codSettledAt: order.codSettledAt,
      codSettledBy: order.codSettledBy,
      payoutRequestId: order.payoutRequestId,
    })
    .from(order)
    .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
    .where(and(...conditions))
    .limit(1)

  if (!row) return notFound()
  return NextResponse.json(row)
}
