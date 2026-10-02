import { asc, eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { cachedStats, statTag } from "@/lib/cached-stats"
import { dbRead } from "@/lib/db"
import { rider } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehouseRidersPageClient } from "./riders-client"

const RIDER_COLUMNS = {
  id: rider.id,
  name: rider.name,
  email: rider.email,
  phone: rider.phone,
  zone: rider.zone,
  address: rider.address,
  status: rider.status,
  taskType: rider.taskType,
  warehouseId: rider.warehouseId,
  isActive: rider.isActive,
  nidNumber: rider.nidNumber,
  createdAt: rider.createdAt,
  updatedAt: rider.updatedAt,
}

/**
 * The four rider tile numbers for one warehouse, in one pass, cached.
 *
 * This is the shape that makes the scope argument load-bearing rather than
 * stylistic: without it every warehouse admin would be served the same entry,
 * and the tiles would quietly report one warehouse's riders to another. The
 * warehouse id arrives as a plain string — part of the cache key — and the
 * `where` clause is rebuilt from it inside the callback, because a Drizzle
 * builder captured from the request scope is not serialisable and would make
 * the key meaningless.
 */
const getWarehouseRiderTiles = cachedStats(
  async (warehouseId: string) => {
    const [stats] = await dbRead
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${rider.isActive})::int`,
        delivery: sql<number>`count(*) filter (where ${rider.taskType} in ('DELIVERY', 'BOTH'))::int`,
        pickup: sql<number>`count(*) filter (where ${rider.taskType} in ('PICKUP', 'BOTH'))::int`,
      })
      .from(rider)
      .where(eq(rider.warehouseId, warehouseId))

    return {
      total: stats?.total ?? 0,
      active: stats?.active ?? 0,
      delivery: stats?.delivery ?? 0,
      pickup: stats?.pickup ?? 0,
    }
  },
  { key: "warehouse-rider-tiles", tags: [statTag("rider")] },
)

export default async function WarehouseRidersPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  const warehouseScope = eq(rider.warehouseId, me.warehouseId)

  const [stats, rows] = await Promise.all([
    getWarehouseRiderTiles(me.warehouseId),
    dbRead
      .select(RIDER_COLUMNS)
      .from(rider)
      .where(warehouseScope)
      .orderBy(asc(rider.name))
      .limit(limit),
  ])

  return (
    <WarehouseRidersPageClient
      initialData={rows}
      initialTotal={stats.total}
      initialCounts={{
        active: stats.active,
        delivery: stats.delivery,
        pickup: stats.pickup,
      }}
    />
  )
}
