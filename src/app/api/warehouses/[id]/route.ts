import { and, eq, ne } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { order, profile, rider, warehouse } from "@/lib/db/schema"
import { parseBody, warehouseUpdateSchema } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(async (

  _req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { id } = await params

  const isAdmin = me.role === "SUPER_ADMIN"
  const isWarehouseAdmin =
    me.role === "WAREHOUSE_ADMIN" && me.warehouseId === id
  if (!isAdmin && !isWarehouseAdmin) {
    return forbidden()
  }

  const [found] = await dbRead
    .select({
      id: warehouse.id,
      name: warehouse.name,
      address: warehouse.address,
      city: warehouse.city,
      isActive: warehouse.isActive,
      managedBy: warehouse.managedBy,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    })
    .from(warehouse)
    .where(eq(warehouse.id, id))
    .limit(1)

  if (!found) return notFound()

  return NextResponse.json(found)
})


export const PATCH = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const { id } = await params
  const parsed = await parseBody(req, warehouseUpdateSchema)
  if (parsed.error) return parsed.error
  const { name, address, city, isActive } = parsed.data

  const updates: {
    name?: string
    address?: string
    city?: string
    isActive?: boolean
  } = {}

  if (name !== undefined) updates.name = name.trim()
  if (address !== undefined) updates.address = address.trim()
  if (city !== undefined) updates.city = city.trim()
  if (isActive !== undefined) updates.isActive = isActive

  if (updates.name !== undefined || updates.city !== undefined) {
    const [current] = await db
      .select({ name: warehouse.name, city: warehouse.city })
      .from(warehouse)
      .where(eq(warehouse.id, id))
      .limit(1)
    if (!current) return notFound()
    const nextName = updates.name ?? current.name
    const nextCity = updates.city ?? current.city
    const [clash] = await db
      .select({ id: warehouse.id })
      .from(warehouse)
      .where(
        and(
          eq(warehouse.name, nextName),
          eq(warehouse.city, nextCity),
          ne(warehouse.id, id),
        ),
      )
      .limit(1)
    if (clash) {
      return conflict("A warehouse with that name already exists in this city.")
    }
  }

  const [updated] = await db
    .update(warehouse)
    .set(updates)
    .where(eq(warehouse.id, id))
    .returning()

  if (!updated) return notFound()

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "WAREHOUSE_UPDATED",
    entityType: "warehouse",
    entityId: updated.id,
    description: `Updated warehouse ${updated.name}`,
    metadata: updates,
  })

  return NextResponse.json(updated)
})


export const DELETE = withErrorHandler(async (

  _req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const { id } = await params

  const [orderRef] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.warehouseId, id))
    .limit(1)
  const [riderRef] = await db
    .select({ id: rider.id })
    .from(rider)
    .where(eq(rider.warehouseId, id))
    .limit(1)
  const [profileRef] = await db
    .select({ userId: profile.userId })
    .from(profile)
    .where(eq(profile.warehouseId, id))
    .limit(1)

  if (orderRef || riderRef || profileRef) {
    return conflict(
      "This warehouse is in use by orders, riders, or warehouse admins and cannot be deleted. Deactivate it instead.",
    )
  }

  const [existing] = await db
    .select({ name: warehouse.name })
    .from(warehouse)
    .where(eq(warehouse.id, id))
    .limit(1)

  await db.delete(warehouse).where(eq(warehouse.id, id))

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "WAREHOUSE_DELETED",
    entityType: "warehouse",
    entityId: id,
    description: `Deleted warehouse ${existing?.name ?? id}`,
  })

  return NextResponse.json({ ok: true })
})

