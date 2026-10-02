import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { refreshStats, statTag } from "@/lib/cached-stats"
import { db } from "@/lib/db"
import { rider } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    const isAdmin = me.role === "SUPER_ADMIN"
    const isWarehouseAdmin = me.role === "WAREHOUSE_ADMIN"
    if (!isAdmin && !isWarehouseAdmin) {
      return forbidden()
    }

    const { id } = await params

    const [current] = await db
      .select({ isActive: rider.isActive, warehouseId: rider.warehouseId })
      .from(rider)
      .where(eq(rider.id, id))
      .limit(1)

    if (!current) return notFound()

    // Warehouse Admins can only toggle riders based at their own hub.
    if (
      isWarehouseAdmin &&
      (!me.warehouseId || current.warehouseId !== me.warehouseId)
    ) {
      return forbidden()
    }

    const [updated] = await db
      .update(rider)
      .set({ isActive: !current.isActive })
      // Lost-update guard (ROADMAP R0.9) — same reasoning as
      // src/app/api/team/[id]/active/route.ts: without this clause two
      // concurrent toggles write the same value and one activation is silently
      // lost. A miss is reported as a conflict, not overwritten.
      .where(and(eq(rider.id, id), eq(rider.isActive, current.isActive)))
      .returning()

    if (!updated) {
      return conflict(
        "Rider status changed while saving. Reload and try again.",
      )
    }

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: updated.isActive ? "RIDER_ACTIVATED" : "RIDER_DEACTIVATED",
      entityType: "rider",
      entityId: updated.id,
      description: `${updated.isActive ? "Activated" : "Deactivated"} rider ${updated.name}`,
    })

    refreshStats(statTag("rider"))

    return NextResponse.json(updated)
  },
)
