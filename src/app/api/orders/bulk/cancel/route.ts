import { and, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { order } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"

const bulkCancelSchema = idsSchema.extend({
  reason: z.string().trim().min(1).optional(),
})

const CANCELLABLE_STATUSES = [
  "PENDING",
  "APPROVED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
] as const

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN" && me.role !== "WAREHOUSE_ADMIN")
    return forbidden()

  const parsed = await parseBody(req, bulkCancelSchema)
  if (parsed.error) return parsed.error
  const { ids, reason } = parsed.data

  const cancellable = await db
    .select({ id: order.id })
    .from(order)
    .where(
      and(inArray(order.id, ids), inArray(order.status, CANCELLABLE_STATUSES)),
    )

  if (cancellable.length === 0) {
    return badRequest("No cancellable orders found for the given IDs.")
  }

  const cancellableIds = cancellable.map((o) => o.id)
  const now = new Date().toISOString()
  const updated = await db
    .update(order)
    .set({
      status: "CANCELLED",
      cancelledAt: now,
      cancelledBy: me.name,
      cancelReason: reason?.trim() ?? null,
    })
    .where(
      and(
        inArray(order.id, cancellableIds),
        inArray(order.status, CANCELLABLE_STATUSES),
      ),
    )
    .returning()

  await Promise.all(
    updated.map((o) =>
      logAudit({
        actor: { userId: me.userId, name: me.name, role: me.role },
        action: "ORDER_CANCEL",
        entityType: "order",
        entityId: o.id,
        description: `Cancelled order ${o.id}`,
      }),
    ),
  )

  return NextResponse.json({ ok: true, count: updated.length })
}
