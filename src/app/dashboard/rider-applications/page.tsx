import { sql } from "drizzle-orm"
import { redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { rider, warehouse } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { RiderApplicationsPageClient } from "./rider-applications-client"

export default async function RiderApplicationsPage() {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())
  if (me.role !== "SUPER_ADMIN") redirect("/login")

  const limit = 20

  const [[{ total }], rows, stats] = await Promise.all([
    dbRead.select({ total: sql<number>`count(*)::int` }).from(rider),
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
      .orderBy(rider.createdAt)
      .limit(limit),
    dbRead
      .select({
        status: rider.status,
        count: sql<number>`count(*)::int`,
      })
      .from(rider)
      .groupBy(rider.status),
  ])

  const statsMap = Object.fromEntries(stats.map((s) => [s.status, s.count]))

  return (
    <RiderApplicationsPageClient
      initialData={rows}
      initialTotal={total}
      initialCounts={{
        pending: Number(statsMap.PENDING ?? 0),
        active: Number(statsMap.ACTIVE ?? 0),
        rejected: Number(statsMap.REJECTED ?? 0),
      }}
    />
  )
}
