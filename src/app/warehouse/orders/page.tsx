import { desc, eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { buildWarehouseOrderScope } from "@/lib/db/order-scope"
import { deliveryCity, order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseOrdersPageClient } from "./orders-client"

const ORDER_COLUMNS = {
  ...ORDER_CORE_COLUMNS,
  pickedUpAt: order.pickedUpAt,
  receivedAtWarehouseAt: order.receivedAtWarehouseAt,
  receivedByWarehouse: order.receivedByWarehouse,
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
  codSettledBy: order.codSettledBy,
  payoutRequestId: order.payoutRequestId,
}

export default async function WarehouseOrdersPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  const warehouseScope = buildWarehouseOrderScope(me.warehouseId)

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

  return <WarehouseOrdersPageClient initialData={rows} initialTotal={total} />
}
