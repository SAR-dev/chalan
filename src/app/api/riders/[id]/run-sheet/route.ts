import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { dbRead } from "@/lib/db"
import { deliveryCity, deliveryZone, order, rider } from "@/lib/db/schema"
import { buildRunSheet } from "@/lib/run-sheet"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * The rider's open run. Same two statuses the load counter counts — a parcel
 * that has left `OUT_FOR_DELIVERY` is no longer something to sequence.
 */
const ACTIVE_DELIVERY_STATUSES = ["IN_TRANSIT", "OUT_FOR_DELIVERY"] as const

export const GET = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    const { id } = await params

    const [row] = await dbRead
      .select({
        id: rider.id,
        name: rider.name,
        warehouseId: rider.warehouseId,
      })
      .from(rider)
      .where(eq(rider.id, id))
      .limit(1)
    if (!row) return notFound()

    // A rider sees their own run, a warehouse admin sees the riders at their
    // own hub, and a super admin sees anyone's. Anyone else has no business
    // reading a colleague's workload or delivery addresses.
    const allowed =
      me.role === "SUPER_ADMIN" ||
      (me.role === "WAREHOUSE_ADMIN" &&
        Boolean(me.warehouseId) &&
        row.warehouseId === me.warehouseId) ||
      (me.role === "RIDER" && me.riderId === id)
    if (!allowed) return forbidden()

    const rows = await dbRead
      .select({
        id: order.id,
        zoneId: deliveryCity.zoneId,
        zoneName: deliveryZone.name,
        cityName: deliveryCity.name,
      })
      .from(order)
      .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
      .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
      .where(
        and(
          eq(order.deliveryRiderId, id),
          inArray(order.status, [...ACTIVE_DELIVERY_STATUSES]),
        ),
      )

    const zoneNames = new Map<string, string>()
    for (const r of rows) {
      if (r.zoneId && r.zoneName) zoneNames.set(r.zoneId, r.zoneName)
    }

    return NextResponse.json({
      riderId: row.id,
      riderName: row.name,
      ...buildRunSheet({
        orders: rows.map((r) => ({
          id: r.id,
          zoneId: r.zoneId,
          cityName: r.cityName,
        })),
        zoneNames,
      }),
    })
  },
)
