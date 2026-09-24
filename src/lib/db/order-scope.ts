import { and, eq, isNull, or, type SQL } from "drizzle-orm"
import { order } from "@/lib/db/schema"

/**
 * The single source of truth for which orders a WAREHOUSE_ADMIN may see:
 *
 *  - parcels already logged into their warehouse,
 *  - picked-up parcels not yet assigned to any warehouse (incoming intake
 *    candidates), and
 *  - APPROVED orders without a pickup rider (so warehouse admins can assign
 *    one).
 *
 * Used by the list endpoint (`/api/orders`), the detail endpoint
 * (`/api/orders/[id]`), and the server-rendered warehouse orders page so the
 * three can never drift apart (which previously 404'd the details dialog for
 * APPROVED/unassigned orders visible in the list).
 */
export function buildWarehouseOrderScope(warehouseId: string): SQL | undefined {
  return or(
    eq(order.warehouseId, warehouseId),
    and(isNull(order.warehouseId), eq(order.status, "PICKED_UP")),
    and(isNull(order.pickupRiderId), eq(order.status, "APPROVED")),
  )
}
