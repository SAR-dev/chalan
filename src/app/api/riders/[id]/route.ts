import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { rider } from "@/lib/db/schema"
import { parseBody, riderUpdateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id } = await params

    const [found] = await dbRead
      .select({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        zone: rider.zone,
        taskType: rider.taskType,
        warehouseId: rider.warehouseId,
        isActive: rider.isActive,
      })
      .from(rider)
      .where(eq(rider.id, id))
      .limit(1)

    if (!found) return notFound()

    // Riders can only fetch their own record; others need admin/super-admin.
    const isOwner = me.role === "RIDER" && me.riderId === id
    const isAdmin = me.role === "SUPER_ADMIN"
    const isWarehouseAdmin = me.role === "WAREHOUSE_ADMIN"
    if (!isOwner && !isAdmin && !isWarehouseAdmin) {
      return forbidden()
    }
    // Warehouse admins are scoped to riders at their own hub, same as the
    // list endpoint and PATCH below.
    if (isWarehouseAdmin && found.warehouseId !== me.warehouseId) {
      return forbidden()
    }

    return NextResponse.json(found)
  },
)

// Update a rider's details. Admins / Super Admins can edit any rider and
// reassign their warehouse and task type. Warehouse Admins can only edit
// riders based at their own hub and may not move a rider to another hub.
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const isAdmin = me.role === "SUPER_ADMIN"
    const isWarehouseAdmin = me.role === "WAREHOUSE_ADMIN"
    if (!isAdmin && !isWarehouseAdmin) {
      return forbidden()
    }

    const { id } = await params

    const [current] = await db
      .select({
        id: rider.id,
        warehouseId: rider.warehouseId,
      })
      .from(rider)
      .where(eq(rider.id, id))
      .limit(1)
    if (!current) {
      return notFound()
    }

    const parsed = await parseBody(req, riderUpdateSchema)
    if (parsed.error) return parsed.error
    const { name, phone, zone, warehouseId, taskType, isActive } = parsed.data

    // Warehouse Admins are scoped to riders at their own hub and cannot move a
    // rider away from it.
    if (isWarehouseAdmin) {
      if (!me.warehouseId || current.warehouseId !== me.warehouseId) {
        return forbidden()
      }
      if (warehouseId !== undefined && warehouseId !== me.warehouseId) {
        return forbidden("You cannot move a rider to another warehouse.")
      }
    }

    const [updated] = await db
      .update(rider)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(zone !== undefined ? { zone } : {}),
        // Only Admins may reassign the home warehouse.
        ...(isAdmin && warehouseId !== undefined ? { warehouseId } : {}),
        ...(taskType !== undefined ? { taskType } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      })
      .where(eq(rider.id, id))
      .returning()

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "RIDER_UPDATED",
      entityType: "rider",
      entityId: updated.id,
      description: `Updated rider ${updated.name}`,
      metadata: { name, phone, zone, warehouseId, taskType, isActive },
    })

    return NextResponse.json(updated)
  },
)
