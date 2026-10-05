import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { cachedStats, statTag } from "@/lib/cached-stats"
import { dbRead } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseOverviewClient } from "./overview-client"

/**
 * The seven statuses a warehouse admin can still do something about, in board
 * order. PENDING (approve), APPROVED (assign a pickup rider), PICKED_UP
 * (receive), IN_WAREHOUSE (dispatch), IN_TRANSIT and OUT_FOR_DELIVERY (watch),
 * FAILED_ATTEMPT (resolve).
 *
 * DELIVERED, CANCELLED and RETURNED are absent on purpose: nothing can be done
 * to a closed parcel, so a tile counting them would advertise work that does
 * not exist. They are counted on the Completed page instead.
 */
const ACTIONABLE_STATUSES = [
  "PENDING",
  "APPROVED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "FAILED_ATTEMPT",
] as const

type ActionableStatus = (typeof ACTIONABLE_STATUSES)[number]

/**
 * Per-status parcel counts for one warehouse, cached.
 *
 * One grouped query rather than seven `count(*)`s: a warehouse with a busy
 * floor would otherwise issue eight round trips to render one row of tiles.
 * Every status the caller did not ask about comes back absent rather than 0, so
 * the client fills the gaps itself and a new status cannot silently inherit a
 * neighbour's number.
 */
const getActionableCounts = cachedStats(
  async (warehouseId: string) => {
    const rows = await dbRead
      .select({ status: order.status, total: count() })
      .from(order)
      .where(
        and(
          eq(order.warehouseId, warehouseId),
          inArray(order.status, [...ACTIONABLE_STATUSES]),
        ),
      )
      .groupBy(order.status)

    return Object.fromEntries(
      rows.map((row) => [row.status as ActionableStatus, row.total]),
    ) as Partial<Record<ActionableStatus, number>>
  },
  { key: "warehouse-actionable-counts", tags: [statTag("order")] },
)

/**
 * Delivered parcels whose cash has not been handed over yet, cached.
 *
 * Same set the COD Settlement page bills against (`DELIVERED` + `codSettledAt
 * IS NULL`) — deliberately including parcels with no delivery rider, because
 * "somebody has the cash and has not reported it" is exactly what a warehouse
 * admin needs chased, and the settlement page splits it per rider so the
 * unassigned remainder would otherwise be invisible from both pages.
 */
const getCodPendingCount = cachedStats(
  async (warehouseId: string) => {
    const [row] = await dbRead
      .select({ total: sql<number>`count(*)::int` })
      .from(order)
      .where(
        and(
          eq(order.warehouseId, warehouseId),
          eq(order.status, "DELIVERED"),
          isNull(order.codSettledAt),
        ),
      )
    return row?.total ?? 0
  },
  { key: "warehouse-cod-pending", tags: [statTag("order")] },
)

export default async function WarehouseOverviewPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const [counts, codPending] = await Promise.all([
    getActionableCounts(me.warehouseId),
    getCodPendingCount(me.warehouseId),
  ])

  return <WarehouseOverviewClient counts={counts} codPending={codPending} />
}
