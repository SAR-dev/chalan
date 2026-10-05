import { and, eq, isNull, or, type SQL } from "drizzle-orm"
import { order } from "@/lib/db/schema"

/**
 * The single source of truth for which orders a WAREHOUSE_ADMIN may see:
 *
 *  - parcels logged into (or belonging to) their warehouse, and
 *  - APPROVED orders without a pickup rider (so warehouse admins can assign
 *    one).
 *
 * Used by the list endpoint (`/api/orders`), the detail endpoint
 * (`/api/orders/[id]`), and the server-rendered warehouse orders page so the
 * three can never drift apart (which previously 404'd the details dialog for
 * APPROVED/unassigned orders visible in the list).
 *
 * A third clause used to OR in `warehouseId IS NULL AND status = 'PICKED_UP'`
 * for "incoming intake candidates". It can never match: `order.warehouseId` is
 * NOT NULL and its FK is `ON DELETE no action`, so no row can be null and no
 * update in the codebase assigns one. Inbound parcels are driven by *status*
 * (`PICKED_UP`, now the board's Picked-up lane), which branch 1 already
 * covers — so the clause only made the planner consider an impossible case and
 * forced a bitmap-OR over an otherwise index-friendly predicate.
 */
export function buildWarehouseOrderScope(warehouseId: string): SQL | undefined {
  return or(
    eq(order.warehouseId, warehouseId),
    and(isNull(order.pickupRiderId), eq(order.status, "APPROVED")),
  )
}
