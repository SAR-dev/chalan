import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { merchant, order } from "@/lib/db/schema"
import { idsSchema, parseBody } from "@/lib/validation"

export async function PATCH(req: Request) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  const { ids } = parsed.data

  const pendingOrders = await db
    .select({
      id: order.id,
      merchantId: order.merchantId,
      parcelWeightKg: order.parcelWeightKg,
    })
    .from(order)
    .where(and(inArray(order.id, ids), eq(order.status, "PENDING")))

  if (pendingOrders.length === 0) {
    return badRequest("No PENDING orders found for the given IDs.")
  }

  const now = new Date().toISOString()
  const validIds: string[] = []

  for (const o of pendingOrders) {
    const [merchantRow] = await db
      .select({ maxWeightKg: merchant.maxWeightKg })
      .from(merchant)
      .where(eq(merchant.id, o.merchantId))
      .limit(1)
    if (merchantRow && o.parcelWeightKg > merchantRow.maxWeightKg) continue
    validIds.push(o.id)
  }

  if (validIds.length === 0) {
    return badRequest(
      "None of the selected orders can be approved (weight limit).",
    )
  }

  const updated = await db
    .update(order)
    .set({ status: "APPROVED", approvedBy: me.name, approvedAt: now })
    .where(and(inArray(order.id, validIds), eq(order.status, "PENDING")))
    .returning()

  for (const o of updated) {
    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "ORDER_APPROVE",
      entityType: "order",
      entityId: o.id,
      description: `Approved order ${o.id}`,
    })
  }

  return NextResponse.json({ ok: true, count: updated.length })
}
