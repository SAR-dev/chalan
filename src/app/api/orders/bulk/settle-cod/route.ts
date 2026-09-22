import { and, eq, inArray, isNull } from "drizzle-orm"
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

  const settleable = await db
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        inArray(order.id, ids),
        eq(order.status, "DELIVERED"),
        isNull(order.codSettledAt),
      ),
    )

  if (settleable.length === 0) {
    return badRequest("No unsettled orders found for the given IDs.")
  }

  const settleableIds = settleable.map((o) => o.id)
  const now = new Date().toISOString()
  const updated = await db
    .update(order)
    .set({ codSettledAt: now, codSettledBy: me.name })
    .where(
      and(
        inArray(order.id, settleableIds),
        eq(order.status, "DELIVERED"),
        isNull(order.codSettledAt),
      ),
    )
    .returning()

  for (const o of updated) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ORDER_SETTLE_COD",
      entityType: "order",
      entityId: o.id,
      description: `Settled COD for order ${o.id}`,
    })
  }

  return NextResponse.json({ ok: true, count: updated.length })
}
