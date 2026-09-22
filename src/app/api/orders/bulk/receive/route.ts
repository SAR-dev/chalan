import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "WAREHOUSE_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  const conditions = [inArray(order.id, ids), eq(order.status, "PICKED_UP")]
  if (me.warehouseId) {
    conditions.push(eq(order.warehouseId, me.warehouseId))
  }

  const receivable = await db
    .select({ id: order.id })
    .from(order)
    .where(and(...conditions))

  if (receivable.length === 0) {
    return badRequest("No receivable orders found for the given IDs.")
  }

  const receivableIds = receivable.map((o) => o.id)
  const now = new Date().toISOString()
  const updateConditions = [
    inArray(order.id, receivableIds),
    eq(order.status, "PICKED_UP"),
  ]
  if (me.warehouseId) {
    updateConditions.push(eq(order.warehouseId, me.warehouseId))
  }
  const updated = await db
    .update(order)
    .set({
      status: "IN_WAREHOUSE",
      receivedAtWarehouseAt: now,
      receivedByWarehouse: me.name,
    })
    .where(and(...updateConditions))
    .returning()

  for (const o of updated) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ORDER_RECEIVE",
      entityType: "order",
      entityId: o.id,
      description: `Received order ${o.id} at warehouse`,
    })
  }

  return NextResponse.json({ ok: true, count: updated.length })
}
