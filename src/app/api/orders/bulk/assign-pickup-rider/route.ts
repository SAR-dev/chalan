import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { order, rider } from "@/lib/db/schema"
import { parseBody } from "@/lib/validation"

const bulkAssignPickupSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  riderId: z.string().min(1, "Rider is required"),
})

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "WAREHOUSE_ADMIN" || !me.warehouseId) return forbidden()

  const parsed = await parseBody(req, bulkAssignPickupSchema)
  if (parsed.error) return parsed.error
  const { ids, riderId } = parsed.data

  const [riderRow] = await db
    .select({ id: rider.id })
    .from(rider)
    .where(and(eq(rider.id, riderId), eq(rider.isActive, true)))
    .limit(1)
  if (!riderRow) return badRequest("Rider not found or inactive.")

  const assignable = await db
    .select({ id: order.id })
    .from(order)
    .where(and(inArray(order.id, ids), eq(order.status, "APPROVED")))

  if (assignable.length === 0) {
    return badRequest("No APPROVED orders found for the given IDs.")
  }

  const assignableIds = assignable.map((o) => o.id)
  const updated = await db
    .update(order)
    .set({ pickupRiderId: riderId })
    .where(and(inArray(order.id, assignableIds), eq(order.status, "APPROVED")))
    .returning()

  for (const o of updated) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ORDER_ASSIGN_PICKUP_RIDER",
      entityType: "order",
      entityId: o.id,
      description: `Assigned pickup rider for order ${o.id}`,
    })
  }

  return NextResponse.json({ ok: true, count: updated.length })
}
