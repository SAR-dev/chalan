import { sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { rider, warehouse } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { RidersPageClient } from "./riders-client"

export default async function RidersPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[stats], rows] = await Promise.all([
    dbRead
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${rider.isActive})::int`,
        delivery: sql<number>`count(*) filter (where ${rider.taskType} in ('DELIVERY', 'BOTH'))::int`,
        pickup: sql<number>`count(*) filter (where ${rider.taskType} in ('PICKUP', 'BOTH'))::int`,
      })
      .from(rider),
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
      initialTotal={stats?.total ?? 0}
      initialCounts={{
        active: stats?.active ?? 0,
        delivery: stats?.delivery ?? 0,
        pickup: stats?.pickup ?? 0,
      }}
    />
  )
}
