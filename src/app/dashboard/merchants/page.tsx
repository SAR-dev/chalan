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

  const [[{ total }], rows, counts] = await Promise.all([
    dbRead.select({ total: sql<number>`count(*)::int` }).from(merchant),
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
