import { sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { warehouse } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { WarehousesPageClient } from "./warehouses-client"

export default async function WarehousesPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 100

  const [[{ total }], rows] = await Promise.all([
    dbRead.select({ total: sql<number>`count(*)::int` }).from(warehouse),
    dbRead.select().from(warehouse).orderBy(warehouse.name).limit(limit),
  ])

  return <WarehousesPageClient initialData={rows} initialTotal={total} />
}
