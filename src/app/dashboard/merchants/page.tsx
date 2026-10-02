import { desc, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { MerchantsPageClient } from "./merchants-client"

export default async function MerchantsPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  // The per-status counts and the row total are the same number arrived at
  // twice. `GROUP BY status` already visits every row, so summing the groups
  // gives the total for one scan instead of two — and unlike a cache it is
  // still exact, which matters because this total is the list's pagination
  // footer, not just a tab badge.
  const [rows, counts] = await Promise.all([
    dbRead
      .select()
      .from(merchant)
      .orderBy(desc(merchant.createdAt))
      .limit(limit),
    dbRead
      .select({
        status: merchant.status,
        count: sql<number>`count(*)::int`,
      })
      .from(merchant)
      .groupBy(merchant.status),
  ])

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c.count]))
  const total = counts.reduce((sum, c) => sum + c.count, 0)

  return (
    <MerchantsPageClient
      initialData={rows}
      initialTotal={total}
      initialCounts={{
        total,
        active: countMap.ACTIVE ?? 0,
        suspended: countMap.SUSPENDED ?? 0,
      }}
    />
  )
}
