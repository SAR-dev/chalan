import type { Order, OrderStatus, Rider } from "@/lib/types"

/**
 * Board grouping for the warehouse "Ongoing" kanban.
 *
 * Two views of the same rows, and the rule that makes the rider view honest:
 * **a card sits in exactly one column, under whoever holds it right now.**
 * A parcel that is in the warehouse and already has a delivery rider is shown
 * under that rider — not duplicated into a status column and a rider column,
 * and not hidden because it happens to be in a state with no rider.
 *
 * "Holding it right now" means the rider responsible for the *next* leg:
 * a parcel waiting to be collected belongs to the pickup rider, and a parcel
 * that is already in the warehouse belongs to the delivery rider. That is the
 * only split that makes the column headings mean "who do I chase" — a PICKED_UP
 * parcel has no business sitting in the delivery rider's column, because the
 * delivery rider cannot touch it until it is received.
 */

/** The statuses the board owns, in column order. */
export const ONGOING_STATUSES = [
  "APPROVED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
] as const satisfies readonly OrderStatus[]

export type OngoingStatus = (typeof ONGOING_STATUSES)[number]

/** Column headings for the status view, in board order. */
export const ONGOING_STATUS_LABELS: Record<OngoingStatus, string> = {
  APPROVED: "Approved",
  PICKED_UP: "Picked up",
  IN_WAREHOUSE: "In warehouse",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
}

/** Synthetic column key for parcels that have no rider on the current leg. */
export const UNASSIGNED_COLUMN = "UNASSIGNED"

export const UNASSIGNED_LABEL = "Unassigned"

export interface BoardColumn {
  /** Stable key: a status, a rider id, or `UNASSIGNED_COLUMN`. */
  id: string
  label: string
  orders: Order[]
}

function isOngoingStatus(status: OrderStatus): status is OngoingStatus {
  return (ONGOING_STATUSES as readonly OrderStatus[]).includes(status)
}

/**
 * Which rider owns the parcel's next leg, or null when nobody does.
 *
 * Kept separate from the grouping functions so the "who holds this" question
 * has one answer that the status view, the rider view and the card's own
 * action button can all read.
 */
export function nextLegRiderId(order: Order): string | null {
  switch (order.status) {
    case "APPROVED":
    case "PICKED_UP":
      return order.pickupRiderId ?? null
    case "IN_WAREHOUSE":
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return order.deliveryRiderId ?? null
    default:
      return null
  }
}

/**
 * Group by status. Every ongoing status gets a column even when empty — a
 * column that disappears when it empties makes the board jump under the
 * cursor, and "nothing is waiting to be collected" is itself information.
 */
export function groupOngoingByStatus(rows: Order[]): BoardColumn[] {
  const byStatus = new Map<string, Order[]>(
    ONGOING_STATUSES.map((s) => [s, []]),
  )
  for (const row of rows) {
    if (!isOngoingStatus(row.status)) continue
    byStatus.get(row.status)?.push(row)
  }
  return ONGOING_STATUSES.map((status) => ({
    id: status,
    label: ONGOING_STATUS_LABELS[status],
    orders: byStatus.get(status) ?? [],
  }))
}

/**
 * Group by the rider holding each parcel's next leg.
 *
 * Column order is the warehouse's roster order (so the board does not reshuffle
 * between renders), then an `Unassigned` column last — the parcels with nobody
 * on them are the ones needing attention, but they read better at the edge than
 * interleaved with real riders. A rider with no parcels still gets a column.
 */
export function groupOngoingByRider(
  rows: Order[],
  riders: Rider[],
): BoardColumn[] {
  const columns = new Map<string, BoardColumn>()
  for (const rider of riders) {
    columns.set(rider.id, { id: rider.id, label: rider.name, orders: [] })
  }
  const unassigned: Order[] = []

  for (const row of rows) {
    const riderId = nextLegRiderId(row)
    if (!riderId) {
      unassigned.push(row)
      continue
    }
    // A rider id with no roster entry (a rider who moved warehouses, or a roster
    // fetch that has not landed yet) is still somebody's parcel. Show it under
    // its raw id rather than dropping the card or inventing a name for it.
    const column = columns.get(riderId) ?? {
      id: riderId,
      label: riderId,
      orders: [],
    }
    column.orders.push(row)
    columns.set(riderId, column)
  }

  const rosterIds = new Set(riders.map((r) => r.id))
  const ordered = Array.from(columns.entries())
    .filter(([id]) => rosterIds.has(id))
    .map(([, column]) => column)
  // Off-roster columns trail the roster, in the order their first parcel
  // introduced them.
  for (const [id, column] of columns) {
    if (!rosterIds.has(id)) ordered.push(column)
  }

  if (unassigned.length > 0) {
    ordered.push({
      id: UNASSIGNED_COLUMN,
      label: UNASSIGNED_LABEL,
      orders: unassigned,
    })
  }
  return ordered
}

/** Ids eligible for auto-assign: everything sitting in the warehouse. */
export function inWarehouseIds(rows: Order[]): string[] {
  return rows.filter((o) => o.status === "IN_WAREHOUSE").map((o) => o.id)
}
