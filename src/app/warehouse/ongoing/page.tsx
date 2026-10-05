import { and, asc, eq, inArray } from "drizzle-orm"
import { redirect } from "next/navigation"
import { ONGOING_STATUSES } from "@/features/orders/kanban-grouping"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { ORDER_CORE_COLUMNS } from "@/lib/db/order-columns"
import { buildWarehouseOrderScope } from "@/lib/db/order-scope"
import { deliveryCity, order, pickupLocation } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseOngoingPageClient } from "./ongoing-client"

/**
 * Hard ceiling on the board's row count.
 *
 * The board is a work surface, not an archive — it holds the statuses a
 * warehouse admin can still act on, so the working set is bounded by what is
 * physically in the building and on the road. 500 is far above a realistic
 * live board while keeping one render cheap. Hitting it is surfaced to the user
 * (the client shows a notice) rather than silently truncating, because a
 * dispatcher's worst bug is a parcel that quietly vanished from the board.
 */
const BOARD_LIMIT = 500

const ORDER_COLUMNS = {
  ...ORDER_CORE_COLUMNS,
  // The board's pickup-city filter. `pickupLocationId` names a *shop*, not a
  // city, so the filter needs the location's own city to be answerable at all.
  pickupCityId: pickupLocation.cityId,
  pickedUpAt: order.pickedUpAt,
  receivedAtWarehouseAt: order.receivedAtWarehouseAt,
  receivedByWarehouse: order.receivedByWarehouse,
  dispatchedAt: order.dispatchedAt,
  dispatchedBy: order.dispatchedBy,
  amountCollected: order.amountCollected,
  deliveryAttempts: order.deliveryAttempts,
}

export default async function WarehouseOngoingPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  // Oldest first: the parcels that have been waiting longest are the ones a
  // dispatcher should look at first, and a board sorted the other way pushes
  // them off the bottom of every column.
  const rows = await dbRead
    .select(ORDER_COLUMNS)
    .from(order)
    .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
    .leftJoin(pickupLocation, eq(order.pickupLocationId, pickupLocation.id))
    .where(
      and(
        inArray(order.status, [...ONGOING_STATUSES]),
        buildWarehouseOrderScope(me.warehouseId),
      ),
    )
    .orderBy(asc(order.createdAt))
    .limit(BOARD_LIMIT)

  // Both city dropdowns are filled from the *whole* city table, not from the
  // cities that happen to appear on the page above. A filter whose options
  // change as you type is worse than no filter: picking "Chattogram" and seeing
  // it vanish from the list mid-interaction reads as the board losing data. The
  // list is small (one row per city), so it costs a single cheap query, and it
  // stays stable for the life of the page.
  const cities = await dbRead
    .select({ id: deliveryCity.id, name: deliveryCity.name })
    .from(deliveryCity)
    .orderBy(asc(deliveryCity.name))

  return (
    <WarehouseOngoingPageClient
      initialData={rows}
      truncated={rows.length === BOARD_LIMIT}
      cities={cities}
    />
  )
}
