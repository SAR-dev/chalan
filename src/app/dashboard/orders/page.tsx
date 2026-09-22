import { desc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { OrdersPageClient } from "./orders-client"

export default async function OrdersPage() {
  const me = await requireSession()
  if (!me) redirect("/login")
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ total }], rows, counts] = await Promise.all([
    dbRead.select({ total: sql<number>`count(*)::int` }).from(order),
    dbRead.select().from(order).orderBy(desc(order.createdAt)).limit(limit),
    dbRead
      .select({
        status: order.status,
        count: sql<number>`count(*)::int`,
      })
      .from(order)
      .groupBy(order.status),
  ])

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c.count]))
  const pending = countMap.PENDING ?? 0
  const approved = countMap.APPROVED ?? 0
  const inProgress = Object.entries(countMap)
    .filter(
      ([s]) => !["PENDING", "DELIVERED", "RETURNED", "CANCELLED"].includes(s),
    )
    .reduce((sum, [, c]) => sum + c, 0)

  return (
    <OrdersPageClient
      initialData={rows}
      initialTotal={total}
      initialCounts={{ pending, approved, inProgress, total }}
    />
  )
}
