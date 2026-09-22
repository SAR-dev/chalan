import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { order, rider } from "@/lib/db/schema"
import { parseBody } from "@/lib/validation"

const bulkDispatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  riderId: z.string().min(1, "Rider is required"),
})

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "WAREHOUSE_ADMIN" || !me.warehouseId) return forbidden()

  const parsed = await parseBody(req, bulkDispatchSchema)
  if (parsed.error) return parsed.error
  const { ids, riderId } = parsed.data

  const [riderRow] = await db
    .select({ id: rider.id })
    .from(rider)
    .where(and(eq(rider.id, riderId), eq(rider.isActive, true)))
    .limit(1)
  if (!riderRow) return badRequest("Rider not found or inactive.")

  const conditions = [inArray(order.id, ids), eq(order.status, "IN_WAREHOUSE")]
  if (me.warehouseId) {
    conditions.push(eq(order.warehouseId, me.warehouseId))
  }

  const dispatchable = await db
    .select({ id: order.id })
    .from(order)
    .where(and(...conditions))

  if (dispatchable.length === 0) {
    return badRequest("No IN_WAREHOUSE orders found for the given IDs.")
  }

  const dispatchableIds = dispatchable.map((o) => o.id)
  const now = new Date().toISOString()
  const updateConditions = [
    inArray(order.id, dispatchableIds),
    eq(order.status, "IN_WAREHOUSE"),
  ]
  if (me.warehouseId) {
    updateConditions.push(eq(order.warehouseId, me.warehouseId))
  }
  const updated = await db
    .update(order)
    .set({
      status: "IN_TRANSIT",
      deliveryRiderId: riderId,
      dispatchedAt: now,
      dispatchedBy: me.name,
    })
    .where(and(...updateConditions))
    .returning()

  for (const o of updated) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ORDER_DISPATCH",
      entityType: "order",
      entityId: o.id,
      description: `Dispatched order ${o.id} for delivery`,
    })
  }

  return NextResponse.json({ ok: true, count: updated.length })
}
