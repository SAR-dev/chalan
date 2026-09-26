import { asc, eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
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

export default async function WarehouseRidersPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "WAREHOUSE_ADMIN") redirect("/login")
  if (!me.warehouseId) redirect("/login")

  const limit = 20

  const warehouseScope = eq(rider.warehouseId, me.warehouseId)

  const [[stats], rows] = await Promise.all([
    dbRead
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${rider.isActive})::int`,
        delivery: sql<number>`count(*) filter (where ${rider.taskType} in ('DELIVERY', 'BOTH'))::int`,
        pickup: sql<number>`count(*) filter (where ${rider.taskType} in ('PICKUP', 'BOTH'))::int`,
      })
      .from(rider)
      .where(warehouseScope),
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
      initialTotal={stats?.total ?? 0}
      initialCounts={{
        active: stats?.active ?? 0,
        delivery: stats?.delivery ?? 0,
        pickup: stats?.pickup ?? 0,
      }}
    />
  )
}
