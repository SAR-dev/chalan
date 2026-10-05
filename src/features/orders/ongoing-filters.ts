import type { Order } from "@/lib/types"
import { nextLegRiderId } from "./kanban-grouping"

/**
 * Filters for the warehouse "Ongoing" board.
 *
 * An order-id box plus three dropdowns (rider, pickup city, delivery city),
 * because those are the four questions a dispatcher actually asks of a board:
 * "where is my parcel", "whose is it", "which way did it come from", "where is
 * it going".
 *
 * Filtering happens on the client over the rows the server already fetched. The
 * board is bounded (`BOARD_LIMIT`) and never re-fetches while you type, so a
 * round trip per keystroke would only add latency — and would make the empty
 * columns flicker. The trade is honest: a filter can only narrow what is loaded,
 * which is why the truncation notice sits above the board rather than being
 * buried in this file.
 *
 * The rider filter matches the **next-leg holder** (`nextLegRiderId`), the same
 * answer the rider view groups by and the same name the card prints. Filtering
 * on `pickupRiderId`/`deliveryRiderId` instead would let a dispatcher pick a
 * rider and still not see their parcels, because the parcel is on the other leg.
 */

/**
 * Sentinel for "no rider chosen".
 *
 * Not `null` or `""`: the UI is a Select, whose value must be a non-empty
 * string, and a sentinel also keeps "unassigned" expressible rather than
 * conflating it with "everything".
 */
export const ANY_RIDER = "any"

/** Sentinel for "no city chosen". */
export const ANY_CITY = "any"

export interface OngoingFilters {
  /** Free-text match on the order code. */
  query: string
  /** A rider id, or {@link ANY_RIDER}. */
  riderId: string
  /** A delivery-city id used as a *pickup* city, or {@link ANY_CITY}. */
  pickupCityId: string
  /** A delivery-city id used as a *delivery* city, or {@link ANY_CITY}. */
  deliveryCityId: string
}

export const NO_ONGOING_FILTERS: OngoingFilters = {
  query: "",
  riderId: ANY_RIDER,
  pickupCityId: ANY_CITY,
  deliveryCityId: ANY_CITY,
}

/** True when at least one filter would remove something. */
export function isFiltering(filters: OngoingFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.riderId !== ANY_RIDER ||
    filters.pickupCityId !== ANY_CITY ||
    filters.deliveryCityId !== ANY_CITY
  )
}

/**
 * Narrow board rows. All four filters combine with AND; an unset filter is
 * skipped entirely rather than compared, so a `null` `pickupCityId` (a parcel
 * whose pickup location no longer exists) is not silently dropped when the
 * pickup filter is untouched.
 */
export function filterOngoingOrders(
  rows: Order[],
  filters: OngoingFilters,
): Order[] {
  const query = filters.query.trim().toLowerCase()
  const byRider = filters.riderId !== ANY_RIDER
  const byPickupCity = filters.pickupCityId !== ANY_CITY
  const byDeliveryCity = filters.deliveryCityId !== ANY_CITY

  if (query === "" && !byRider && !byPickupCity && !byDeliveryCity) {
    return rows
  }

  return rows.filter((order) => {
    if (query !== "" && !order.id.toLowerCase().includes(query)) return false
    if (byRider && nextLegRiderId(order) !== filters.riderId) return false
    if (byPickupCity && (order.pickupCityId ?? null) !== filters.pickupCityId) {
      return false
    }
    if (byDeliveryCity && order.deliveryCityId !== filters.deliveryCityId) {
      return false
    }
    return true
  })
}
