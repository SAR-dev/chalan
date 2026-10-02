import { sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { cachedStats, statTag } from "@/lib/cached-stats"
import { dbRead } from "@/lib/db"
import { rider, warehouse } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { RidersPageClient } from "./riders-client"

/**
 * The four rider tile numbers, in one pass, cached.
 *
 * `FILTER` already made this a single scan; what it did not stop was the scan
 * happening on every render of a list the user is actively looking at.
 *
 * `total` is the list's pagination total as well as a tile, and pagination
 * totals are not cached elsewhere in the app. Here it is cached anyway because
 * splitting it out would mean a second scan of the same table for no saving —
 * the `count(*)` and the three `FILTER`s cost the same pass — and because every
 * route that changes the rider roster calls `refreshStats`, so the footer moves
 * with the write rather than with the clock. The 30s TTL is the backstop for a
 * write path that forgets, not the primary mechanism.
 *
 * No arguments: this page is `SUPER_ADMIN`-only, so there is no scope to key on.
 */
const getRiderTiles = cachedStats(
  async () => {
    const [stats] = await dbRead
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${rider.isActive})::int`,
        delivery: sql<number>`count(*) filter (where ${rider.taskType} in ('DELIVERY', 'BOTH'))::int`,
        pickup: sql<number>`count(*) filter (where ${rider.taskType} in ('PICKUP', 'BOTH'))::int`,
      })
      .from(rider)

    return {
      total: stats?.total ?? 0,
      active: stats?.active ?? 0,
      delivery: stats?.delivery ?? 0,
      pickup: stats?.pickup ?? 0,
    }
  },
  { key: "dashboard-rider-tiles", tags: [statTag("rider")] },
)

export default async function RidersPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [stats, rows] = await Promise.all([
    getRiderTiles(),
    dbRead
      .select({
        id: rider.id,
        name: rider.name,
        email: rider.email,
        phone: rider.phone,
        zone: rider.zone,
        address: rider.address,
        nidNumber: rider.nidNumber,
        status: rider.status,
        isActive: rider.isActive,
        taskType: rider.taskType,
        warehouseId: rider.warehouseId,
        approvedBy: rider.approvedBy,
        approvedAt: rider.approvedAt,
        rejectionReason: rider.rejectionReason,
        nidFrontImage: rider.nidFrontImage,
        nidBackImage: rider.nidBackImage,
        nidSelfieImage: rider.nidSelfieImage,
        nidSubmittedAt: rider.nidSubmittedAt,
        nidVerifiedAt: rider.nidVerifiedAt,
        nidVerifiedBy: rider.nidVerifiedBy,
        nidRejectedAt: rider.nidRejectedAt,
        nidRejectedBy: rider.nidRejectedBy,
        nidRejectionReason: rider.nidRejectionReason,
        createdAt: rider.createdAt,
        updatedAt: rider.updatedAt,
        warehouseName: warehouse.name,
      })
      .from(rider)
      .leftJoin(warehouse, sql`${rider.warehouseId} = ${warehouse.id}`)
      .orderBy(rider.name)
      .limit(limit),
  ])

  return (
    <RidersPageClient
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
