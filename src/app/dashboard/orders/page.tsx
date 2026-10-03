import { desc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { cachedStats, statTag } from "@/lib/cached-stats"
import { dbRead } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { OrdersPageClient } from "./orders-client"

/**
 * Total orders plus the status breakdown the tab counters need, in one pass.
 *
 * These were two full passes over `order` — an unpredicated `count(*)` plus a
 * `GROUP BY status` — re-derived on every render and then superseded by SWR's
 * Refetch of `/api/orders`, which runs a third count. Both now
 * come from one `FILTER` aggregate, the same technique
 * `src/app/api/orders/counts/route.ts` already uses.
 *
 * `cachedStats` supplies the 30s TTL, the `stat:order` tag that every order
 * write expires, and the no-arguments rule that keeps the key role-independent
 * — `requireSession()` stays outside the callback, above.
 */
const getOrderCounts = cachedStats(
  async () => {
    // `::int` is required: Postgres bigint arrives as a JS string via
    // node-postgres, and `sql<number>` is a compile-time assertion only.
    const [row] = await dbRead
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${order.status} = 'PENDING')::int`,
        approved: sql<number>`count(*) filter (where ${order.status} = 'APPROVED')::int`,
        inProgress: sql<number>`count(*) filter (where ${order.status} not in ('PENDING', 'DELIVERED', 'RETURNED', 'CANCELLED'))::int`,
      })
      .from(order)
    return {
      total: row?.total ?? 0,
      pending: row?.pending ?? 0,
      approved: row?.approved ?? 0,
      inProgress: row?.inProgress ?? 0,
    }
  },
  { key: "dashboard-order-counts", tags: [statTag("order")] },
)

export default async function OrdersPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  // The recent-orders page is not cached: it is the data the user is looking
  // at, and it is a bounded index scan (LIMIT 20 on createdAt DESC), not a
  // full pass. Only the counts were recomputed from scratch on every render.
  const [counts, rows] = await Promise.all([
    getOrderCounts(),
    dbRead.select().from(order).orderBy(desc(order.createdAt)).limit(limit),
  ])

  return (
    <OrdersPageClient
      initialData={rows}
      initialTotal={counts.total}
      initialCounts={counts}
    />
  )
}
