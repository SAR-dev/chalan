import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const requestedWarehouseId = url.searchParams.get("warehouseId")

  // A warehouse admin may only see counts for their own warehouse; only
  // SUPER_ADMIN can query an arbitrary warehouseId. Other roles (merchants,
  // riders) have no business seeing warehouse operational counts at all.
  let warehouseId: string | null
  if (me.role === "WAREHOUSE_ADMIN") {
    if (requestedWarehouseId && requestedWarehouseId !== me.warehouseId) {
      return forbidden()
    }
    warehouseId = me.warehouseId ?? null
  } else if (me.role === "SUPER_ADMIN") {
    warehouseId = requestedWarehouseId
  } else {
    return forbidden()
  }

  if (!warehouseId) {
    return NextResponse.json({ failedAttempt: 0, unsettled: 0, returned: 0 })
  }

  // All three counts share the same warehouseId predicate, so compute them
  // in a single pass over the order_warehouse_status_created_at index with
  // aggregate FILTER clauses — one round-trip instead of three.
  const [row] = await db
    .select({
      failedAttempt: sql<number>`count(*) filter (where ${order.status} = 'FAILED_ATTEMPT')`,
      unsettled: sql<number>`count(*) filter (where ${order.status} = 'DELIVERED' and ${order.codSettledAt} is null)`,
      returned: sql<number>`count(*) filter (where ${order.status} = 'RETURNED')`,
    })
    .from(order)
    .where(eq(order.warehouseId, warehouseId))

  return NextResponse.json({
    failedAttempt: row?.failedAttempt ?? 0,
    unsettled: row?.unsettled ?? 0,
    returned: row?.returned ?? 0,
  })
})
