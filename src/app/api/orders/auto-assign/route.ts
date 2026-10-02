import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { planAutoAssignment } from "@/lib/auto-assign"
import { dbRead } from "@/lib/db"
import { deliveryCity, deliveryZone, order, rider } from "@/lib/db/schema"
import { autoAssignPlanSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * Parcels that still count as "on the rider" for load balancing.
 *
 * Everything before dispatch is a warehouse's problem, and everything after
 * delivery is history. The two statuses between are the rider's open run.
 */
const ACTIVE_DELIVERY_STATUSES = ["IN_TRANSIT", "OUT_FOR_DELIVERY"] as const

export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  // Only a warehouse admin dispatches, so only a warehouse admin plans. The
  // plan is scoped to their own hub below, so a `warehouseId` in the body
  // would be both redundant and a way to read another hub's workload.
  if (me.role !== "WAREHOUSE_ADMIN" || !me.warehouseId) return forbidden()
  const warehouseId = me.warehouseId

  const parsed = await parseBody(req, autoAssignPlanSchema)
  if (parsed.error) return parsed.error
  const ids = [...new Set(parsed.data.ids)]

  // The zone join rides along on the order read rather than costing its own
  // query: the planner needs a zone per parcel three times over (this order,
  // the active stops, and the name for the reason text) and each extra round
  // trip is another thing that can disagree with the others.
  const orderRows = await dbRead
    .select({
      id: order.id,
      status: order.status,
      warehouseId: order.warehouseId,
      zoneId: deliveryCity.zoneId,
      zoneName: deliveryZone.name,
    })
    .from(order)
    .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
    .leftJoin(deliveryZone, eq(deliveryCity.zoneId, deliveryZone.id))
    .where(inArray(order.id, ids))

  // Eligibility mirrors the `dispatch` transition exactly (active, based here,
  // allowed to deliver) so a proposal can never name a rider that endpoint
  // would then reject. `rider.status` is not part of it because the transition
  // does not check it either — narrowing this alone would produce a plan the
  // dispatcher cannot act on.
  const riderRows = await dbRead
    .select({ id: rider.id, name: rider.name, taskType: rider.taskType })
    .from(rider)
    .where(
      and(
        eq(rider.warehouseId, warehouseId),
        eq(rider.isActive, true),
        inArray(rider.taskType, ["DELIVERY", "BOTH"]),
      ),
    )

  const candidateIds = riderRows.map((r) => r.id)
  const stopRows = candidateIds.length
    ? await dbRead
        .select({
          riderId: order.deliveryRiderId,
          zoneId: deliveryCity.zoneId,
        })
        .from(order)
        .leftJoin(deliveryCity, eq(order.deliveryCityId, deliveryCity.id))
        .where(
          and(
            inArray(order.status, [...ACTIVE_DELIVERY_STATUSES]),
            inArray(order.deliveryRiderId, candidateIds),
          ),
        )
    : []

  // Gate the request the same way the transition would, so the plan names only
  // parcels that can legally be dispatched. Anything filtered out is reported
  // back with its reason instead of being silently dropped from the totals.
  const dispatchable: Array<{ id: string; zoneId: string | null }> = []
  const unassigned: Array<{ orderId: string; reason: string }> = []
  const found = new Set<string>()
  for (const row of orderRows) {
    found.add(row.id)
    if (row.warehouseId !== warehouseId) {
      unassigned.push({
        orderId: row.id,
        reason: "Held at a different warehouse.",
      })
      continue
    }
    if (row.status !== "IN_WAREHOUSE") {
      unassigned.push({
        orderId: row.id,
        reason: "Only parcels waiting in the warehouse can be dispatched.",
      })
      continue
    }
    dispatchable.push({ id: row.id, zoneId: row.zoneId })
  }
  for (const id of ids) {
    if (found.has(id)) continue
    unassigned.push({ orderId: id, reason: "Order not found." })
  }

  const zoneNames = new Map<string, string>()
  for (const row of orderRows) {
    if (row.zoneId && row.zoneName) zoneNames.set(row.zoneId, row.zoneName)
  }

  const plan = planAutoAssignment({
    orders: dispatchable,
    riders: riderRows.map((r) => ({ id: r.id, name: r.name })),
    // `deliveryRiderId` is nullable on the row but cannot be null here — the
    // predicate admits only ids from the roster. Narrowed rather than coerced
    // so an empty string can never be read as a rider.
    activeStops: stopRows.flatMap((s) =>
      s.riderId === null ? [] : [{ riderId: s.riderId, zoneId: s.zoneId }],
    ),
    zoneNames,
  })

  return NextResponse.json({
    assignments: plan.assignments,
    // Route-level rejections come first, then the planner's own (a warehouse
    // with no delivery rider). Stable enough for a human and honest about why
    // a selected parcel is missing from the plan.
    unassigned: [...unassigned, ...plan.unassigned],
    riderLoads: plan.riderLoads,
    eligibleRiderCount: riderRows.length,
  })
})
