/**
 * Spreading a warehouse's ready parcels across its delivery riders.
 *
 * Dispatch used to be one-rider-per-batch and entirely manual: a warehouse
 * admin picked a name from a dropdown for every selection of parcels. Nothing
 * looked at what each rider was already carrying, so the common outcome was one
 * rider holding forty parcels while another held two — and the rider who
 * happened to be picked first absorbed everything.
 *
 * The planner here is a pure function over (orders, riders, what riders are
 * already carrying). It proposes; it never writes. Applying a proposal goes
 * through the ordinary `dispatch` transition, so every rule the state machine
 * enforces still holds and a warehouse admin can always override a suggestion
 * by picking a rider by hand.
 *
 * ## Why the rule is this simple
 *
 * The obvious richer signals are not available. `rider.zone` is free text an
 * admin typed ("Zone 3 / Area 2", "Dhaka South") and has no relationship to
 * `delivery_zone.name` ("Dhaka Metro"), so matching a rider to a parcel's
 * destination by that column would be guesswork. There are no coordinates, no
 * vehicle capacity (deliberately — see the `vehicleType` comment in the rider
 * schema), and no rider-reported position. Load is the one signal that is both
 * real and always populated, so it leads.
 *
 * Zone still earns a place, but only where it is free: as a tie-break between
 * riders on an identical load. That can never let one rider hoard a warehouse's
 * whole day, and it collects the "he's already going that way" win whenever two
 * riders happen to be equally free.
 *
 * ## Determinism
 *
 * Orders are consumed oldest-first (ids are zero-padded sequences, so id order
 * is creation order) and riders are ranked by a total order that ends in the
 * rider id. The same inputs therefore always produce the same plan, which is
 * what makes a proposal safe to show a human and then apply.
 */

/** An order the planner may assign, reduced to what it reasons about. */
export interface AutoAssignOrder {
  id: string
  /** Destination zone via `delivery_city.zoneId`; null when unset. */
  zoneId: string | null
}

/** A rider eligible to be dispatched to, reduced to what the planner names. */
export interface AutoAssignRider {
  id: string
  name: string
}

/** A parcel a rider is already carrying, so their real load can be counted. */
export interface ActiveStop {
  riderId: string
  zoneId: string | null
}

export interface Assignment {
  orderId: string
  riderId: string
  riderName: string
  /** Plain-English justification, safe to render verbatim next to the choice. */
  reason: string
}

export interface UnassignedOrder {
  orderId: string
  reason: string
}

export interface RiderLoad {
  riderId: string
  riderName: string
  /** Parcels the rider already carried when the plan was built. */
  active: number
  /** Parcels this plan adds on top. */
  assigned: number
}

export interface AutoAssignPlan {
  assignments: Assignment[]
  unassigned: UnassignedOrder[]
  /** One entry per eligible rider, including riders left with nothing. */
  riderLoads: RiderLoad[]
}

export interface PlanAutoAssignmentInput {
  orders: readonly AutoAssignOrder[]
  /**
   * Riders the caller has already established are dispatchable (correct
   * warehouse, active, allowed to deliver). Deliberately *not* filtered here —
   * the same eligibility rule lives in the `dispatch` transition, and having
   * one filter in each place is what keeps a proposal applicable.
   */
  riders: readonly AutoAssignRider[]
  activeStops: readonly ActiveStop[]
  /** Zone id to display name, so a reason can name the zone it matched. */
  zoneNames?: ReadonlyMap<string, string>
}

export const NO_ELIGIBLE_RIDER_REASON =
  "No active delivery rider is based at this warehouse."

/**
 * Which term of the rider ranking decided a single choice. Surfaced as the
 * assignment's reason so a warehouse admin can see the rule that fired rather
 * than having to trust it.
 */
type DecidedBy = "load" | "zone" | "id"

interface RankedRider {
  rider: AutoAssignRider
  /** Parcels already carried plus parcels assigned earlier in this same plan. */
  load: number
  /** 0 when the rider is already serving the order's zone, else 1. */
  zoneMiss: number
}

function zoneLabel(
  zoneId: string | null,
  zoneNames: ReadonlyMap<string, string>,
) {
  if (!zoneId) return null
  return zoneNames.get(zoneId) ?? null
}

function reasonFor(
  decidedBy: DecidedBy,
  load: number,
  zoneId: string | null,
  zoneNames: ReadonlyMap<string, string>,
): string {
  if (decidedBy === "load") {
    return `Fewest active parcels (${load}).`
  }
  if (decidedBy === "zone") {
    const zone = zoneLabel(zoneId, zoneNames)
    return zone
      ? `Tied at ${load} active parcels, and already running to ${zone}.`
      : `Tied at ${load} active parcels, and already running to that zone.`
  }
  return `Tied at ${load} active parcels; rider code breaks the tie.`
}

/**
 * Ranks eligible riders against one order and reports what settled it.
 *
 * The comparator is a total order — load, then zone affinity, then rider id —
 * so no input can produce a tie it cannot resolve, and the same inputs always
 * produce the same winner.
 */
function rankRiders(
  riders: readonly AutoAssignRider[],
  loads: Map<string, number>,
  servingZones: Map<string, Set<string>>,
  zoneId: string | null,
): { rider: AutoAssignRider; load: number; decidedBy: DecidedBy } {
  const ranked: RankedRider[] = riders.map((rider) => ({
    rider,
    load: loads.get(rider.id) ?? 0,
    // An order with no destination zone cannot prefer anybody, so neither does
    // anybody else — the term drops out and the load decides alone.
    zoneMiss:
      zoneId === null || (servingZones.get(rider.id)?.has(zoneId) ?? false)
        ? 0
        : 1,
  }))
  ranked.sort((a, b) => {
    if (a.load !== b.load) return a.load - b.load
    if (a.zoneMiss !== b.zoneMiss) return a.zoneMiss - b.zoneMiss
    return a.rider.id < b.rider.id ? -1 : a.rider.id > b.rider.id ? 1 : 0
  })

  const best = ranked[0]
  const runnerUp = ranked[1]
  const decidedBy: DecidedBy =
    !runnerUp || best.load !== runnerUp.load
      ? "load"
      : best.zoneMiss !== runnerUp.zoneMiss
        ? "zone"
        : "id"
  return { rider: best.rider, load: best.load, decidedBy }
}

export function planAutoAssignment({
  orders,
  riders,
  activeStops,
  zoneNames = new Map(),
}: PlanAutoAssignmentInput): AutoAssignPlan {
  const eligible = [...riders].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  const loads = new Map<string, number>()
  const servingZones = new Map<string, Set<string>>()
  for (const rider of eligible) {
    loads.set(rider.id, 0)
    servingZones.set(rider.id, new Set())
  }

  // Count what each rider is already carrying, and remember which zones that
  // work covers so the zone tie-break can see it. Stops belonging to a rider
  // outside this warehouse's roster are ignored — they cannot be candidates, so
  // their load is nobody else's business.
  for (const stop of activeStops) {
    if (!loads.has(stop.riderId)) continue
    loads.set(stop.riderId, (loads.get(stop.riderId) ?? 0) + 1)
    if (stop.zoneId) servingZones.get(stop.riderId)?.add(stop.zoneId)
  }

  const assigned = new Map<string, number>()
  const assignments: Assignment[] = []
  const unassigned: UnassignedOrder[] = []

  // Oldest first: ids are zero-padded sequences (`ORD-000001`), so sorting by id
  // is sorting by creation time without depending on a timestamp column.
  const queue = [...orders].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const order of queue) {
    if (eligible.length === 0) {
      unassigned.push({ orderId: order.id, reason: NO_ELIGIBLE_RIDER_REASON })
      continue
    }
    const { rider, load, decidedBy } = rankRiders(
      eligible,
      loads,
      servingZones,
      order.zoneId,
    )
    assignments.push({
      orderId: order.id,
      riderId: rider.id,
      riderName: rider.name,
      reason: reasonFor(decidedBy, load, order.zoneId, zoneNames),
    })
    loads.set(rider.id, load + 1)
    assigned.set(rider.id, (assigned.get(rider.id) ?? 0) + 1)
    if (order.zoneId) servingZones.get(rider.id)?.add(order.zoneId)
  }

  return {
    assignments,
    unassigned,
    riderLoads: eligible.map((rider) => ({
      riderId: rider.id,
      riderName: rider.name,
      active: (loads.get(rider.id) ?? 0) - (assigned.get(rider.id) ?? 0),
      assigned: assigned.get(rider.id) ?? 0,
    })),
  }
}

/**
 * Groups a plan's assignments into one batch per rider.
 *
 * Applying a plan means calling the bulk `dispatch` endpoint once per rider,
 * because that endpoint takes a single rider id. Returning the grouping from
 * here keeps that shape decision — and the ordering of it — in one tested place
 * instead of inside a click handler.
 */
export function groupAssignmentsByRider(plan: AutoAssignPlan): Array<{
  riderId: string
  riderName: string
  orderIds: string[]
}> {
  const groups = new Map<
    string,
    { riderId: string; riderName: string; orderIds: string[] }
  >()
  for (const assignment of plan.assignments) {
    const existing = groups.get(assignment.riderId)
    if (existing) {
      existing.orderIds.push(assignment.orderId)
      continue
    }
    groups.set(assignment.riderId, {
      riderId: assignment.riderId,
      riderName: assignment.riderName,
      orderIds: [assignment.orderId],
    })
  }
  return [...groups.values()].sort((a, b) =>
    a.riderId < b.riderId ? -1 : a.riderId > b.riderId ? 1 : 0,
  )
}
