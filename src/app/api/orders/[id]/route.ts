import { and, eq, or } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { notFound, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { buildWarehouseOrderScope } from "@/lib/db/order-scope"
import { deliveryCity, order } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
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
        // Same scope as the list endpoint (incl. APPROVED/unassigned orders) so
        // every row in the list opens in the details dialog.
        scope = buildWarehouseOrderScope(me.warehouseId)
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
        ...ORDER_CORE_COLUMNS,
        // Detail-only, and deliberately not added to `ORDER_CORE_COLUMNS`: the
        // list endpoints share that projection and have no reason to carry a
        // recipient's email. Personal data gets the narrower surface.
        recipientMail: order.recipientMail,
        approvedBy: order.approvedBy,
        approvedAt: order.approvedAt,
        assignedAt: order.assignedAt,
        outForPickupAt: order.outForPickupAt,
        pickedUpAt: order.pickedUpAt,
        pickupProofRefs: order.pickupProofRefs,
        receivedAtWarehouseAt: order.receivedAtWarehouseAt,
        receivedByWarehouse: order.receivedByWarehouse,
        dispatchedAt: order.dispatchedAt,
        dispatchedBy: order.dispatchedBy,
        expectedDeliveryDays: order.expectedDeliveryDays,
        expectedDeliveryAt: order.expectedDeliveryAt,
        actualDeliveryDays: order.actualDeliveryDays,
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
        codSettledBy: order.codSettledBy,
        payoutRequestId: order.payoutRequestId,
      })
      .from(order)
      .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
      .where(and(...conditions))
      .limit(1)

    if (!row) return notFound()
    return NextResponse.json(row)
  },
)
