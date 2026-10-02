import { eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { cachedStats, statTag } from "@/lib/cached-stats"
import { dbRead } from "@/lib/db"
import {
  mailConfig,
  merchant,
  order,
  profile,
  rider,
  warehouse,
} from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { OverviewPageClient } from "./overview-client"

/**
 * The six headline numbers on the platform overview, in one cache entry.
 *
 * These were six separate aggregate queries re-derived on every render of the
 * landing page, and they are six of the most repeated numbers in the product —
 * they move only when someone approves a merchant, places an order, or onboards
 * a rider, which is exactly the write path that calls `refreshStats`.
 *
 * One entry rather than six so the whole tile row expires together: a page that
 * showed "3 pending merchants" beside "0 pending orders" because two of six
 * entries had expired would be worse than being half a minute late.
 *
 * No arguments: this page is `SUPER_ADMIN`-only (the check is above), so there
 * is no scope to put in the key. `requireSession()` stays outside the callback
 * for that reason — a cached function that read the session would be keyed on
 * whoever happened to trigger the first render.
 */
const getOverviewTiles = cachedStats(
  async () => {
    const [
      [{ warehouseAdminCount }],
      [{ totalWarehouses, activeWarehouses }],
      [{ pendingMerchants }],
      [{ pendingOrders }],
      [{ pendingRiders }],
      [{ activeMailConfigCount }],
    ] = await Promise.all([
      dbRead
        .select({ warehouseAdminCount: sql<number>`count(*)::int` })
        .from(profile)
        .where(eq(profile.role, "WAREHOUSE_ADMIN")),
      dbRead
        .select({
          totalWarehouses: sql<number>`count(*)::int`,
          activeWarehouses: sql<number>`count(*) filter (where ${warehouse.isActive} = true)::int`,
        })
        .from(warehouse),
      dbRead
        .select({ pendingMerchants: sql<number>`count(*)::int` })
        .from(merchant)
        .where(eq(merchant.status, "PENDING")),
      dbRead
        .select({ pendingOrders: sql<number>`count(*)::int` })
        .from(order)
        .where(eq(order.status, "PENDING")),
      dbRead
        .select({ pendingRiders: sql<number>`count(*)::int` })
        .from(rider)
        .where(eq(rider.status, "PENDING")),
      dbRead
        .select({ activeMailConfigCount: sql<number>`count(*)::int` })
        .from(mailConfig)
        .where(eq(mailConfig.isActive, true)),
    ])

    return {
      warehouseAdminCount,
      totalWarehouses,
      activeWarehouses,
      pendingMerchants,
      pendingOrders,
      pendingRiders,
      hasActiveMailConfig: activeMailConfigCount > 0,
    }
  },
  {
    key: "dashboard-overview-tiles",
    tags: [
      statTag("profile"),
      statTag("warehouse"),
      statTag("merchant"),
      statTag("order"),
      statTag("rider"),
      statTag("mail-config"),
    ],
  },
)

export default async function OverviewPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const tiles = await getOverviewTiles()

  return (
    <OverviewPageClient
      userName={me.name?.split(" ")[0] ?? "Admin"}
      warehouseAdminCount={tiles.warehouseAdminCount}
      totalWarehouses={tiles.totalWarehouses}
      activeWarehouses={tiles.activeWarehouses}
      pendingMerchants={tiles.pendingMerchants}
      pendingOrders={tiles.pendingOrders}
      pendingRiders={tiles.pendingRiders}
      hasActiveMailConfig={tiles.hasActiveMailConfig}
    />
  )
}
