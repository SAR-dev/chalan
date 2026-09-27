import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { rider, warehouse } from "@/lib/db/schema"
import { loginRedirectPath } from "@/lib/login-redirect"
import { RiderDetailClient } from "./detail-client"

export default async function RiderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const me = await requireSession()
  if (!me) redirect(await loginRedirectPath())

  const { id } = await params

  const [foundRider] = await dbRead
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
      warehouseCity: warehouse.city,
    })
    .from(rider)
    .leftJoin(warehouse, eq(rider.warehouseId, warehouse.id))
    .where(eq(rider.id, id))
    .limit(1)

  if (!foundRider) notFound()

  return <RiderDetailClient rider={foundRider} />
}
