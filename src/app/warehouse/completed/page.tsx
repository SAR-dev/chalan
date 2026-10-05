import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { COMPLETED_STATUSES } from "@/features/orders/completed-statuses"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { deliveryCity, order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseCompletedPageClient } from "./completed-client"

const ORDER_COLUMNS = {
  ...ORDER_CORE_COLUMNS,
  deliveredAt: order.deliveredAt,
  deliveryProofRef: order.deliveryProofRef,
  cancelledAt: order.cancelledAt,
  cancelledBy: order.cancelledBy,
  cancelReason: order.cancelReason,
  returnedAt: order.returnedAt,
  returnReason: order.returnReason,
  failedResolvedBy: order.failedResolvedBy,
  amountCollected: order.amountCollected,
  // Not read by any column here, but it is a NOT NULL column of `order`, so the
  // projection has to carry it to satisfy `Order`.
  deliveryAttempts: order.deliveryAttempts,
}

export default async function WarehouseCompletedPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  // `order.warehouseId` is NOT NULL, so every parcel this warehouse ever held
  // carries its id — a plain equality is the whole scope here, no OR clause.
  const warehouseScope = eq(order.warehouseId, me.warehouseId)

  const [[{ total }], rows] = await Promise.all([
    dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(order)
      .where(and(warehouseScope, inArray(order.status, COMPLETED_STATUSES))),
    dbRead
      .select(ORDER_COLUMNS)
      .from(order)
      .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
      .where(and(warehouseScope, inArray(order.status, COMPLETED_STATUSES)))
      .orderBy(desc(order.createdAt))
      .limit(limit),
  ])

  return (
    <WarehouseCompletedPageClient initialData={rows} initialTotal={total} />
  )
}
