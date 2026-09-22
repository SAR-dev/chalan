import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { profile, user, warehouse } from "@/lib/db/schema"
import { parseBody, warehouseAssignSchema } from "@/lib/validation"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const { id } = await params

  const parsed = await parseBody(req, warehouseAssignSchema)
  if (parsed.error) return parsed.error
  const { warehouseId } = parsed.data

  const [current] = await db
    .select({ role: profile.role })
    .from(profile)
    .where(eq(profile.userId, id))
    .limit(1)

  if (!current) return notFound()
  if (current.role !== "WAREHOUSE_ADMIN") {
    return badRequest("Only WAREHOUSE_ADMIN users can be assigned a warehouse")
  }

  // Keep warehouse.managedBy in sync: release any warehouse this admin used to
  // manage, then claim the newly selected one (if any).
  await db
    .update(warehouse)
    .set({ managedBy: null })
    .where(eq(warehouse.managedBy, id))

  if (warehouseId) {
    await db
      .update(warehouse)
      .set({ managedBy: id })
      .where(eq(warehouse.id, warehouseId))
  }

  const [updated] = await db
    .update(profile)
    .set({ warehouseId })
    .where(eq(profile.userId, id))
    .returning()

  const [targetUser] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)

  let warehouseName: string | null = null
  if (warehouseId) {
    const [wh] = await db
      .select({ name: warehouse.name })
      .from(warehouse)
      .where(eq(warehouse.id, warehouseId))
      .limit(1)
    warehouseName = wh?.name ?? warehouseId
  }

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "TEAM_MEMBER_WAREHOUSE_REASSIGNED",
    entityType: "user",
    entityId: id,
    description: warehouseName
      ? `Assigned ${targetUser?.name ?? id} to warehouse ${warehouseName}`
      : `Unassigned ${targetUser?.name ?? id} from their warehouse`,
  })

  return NextResponse.json(updated)
}
