import type { Order } from "@/lib/types"

/**
 * Filters for the warehouse "Ongoing" board.
 *
 * An order-ID box, a pickup-rider dropdown, a delivery-rider dropdown, a
 * pickup-city dropdown and a delivery-city dropdown — the five questions a
 * dispatcher actually asks of a board: "where is my parcel", "who is collecting
 * it", "who is delivering it", "which way did it come from", "where is it
 * going".
 *
 * Pickup and delivery riders are **separate** filters rather than one "the
 * rider" filter, because a parcel has both at once and they are different
 * people at different times: an APPROVED parcel has a pickup rider and no
 * delivery rider, and once it is in the warehouse the reverse is true. A single
 * next-leg filter answered "who holds this right now" well, but it could not
 * answer "show me everything Rakib is collecting" — which is the question a
 * dispatcher planning a collection route asks. Filtering each field directly
 * also means the option list never needs to know what state a parcel is in.
 *
 * Filtering happens on the client over the rows the server already fetched. The
 * board is bounded (`BOARD_LIMIT`) and never re-fetches while you type, so a
 * round trip per keystroke would only add latency — and would make the empty
 * columns flicker. The trade is honest: a filter can only narrow what is loaded,
 * which is why the truncation notice sits above the board rather than being
 * buried in this file.
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
  pickupRiderId: string
  /** A rider id, or {@link ANY_RIDER}. */
  deliveryRiderId: string
  /** A delivery-city id used as a *pickup* city, or {@link ANY_CITY}. */
  pickupCityId: string
  /** A delivery-city id used as a *delivery* city, or {@link ANY_CITY}. */
  deliveryCityId: string
}

export const NO_ONGOING_FILTERS: OngoingFilters = {
  query: "",
  pickupRiderId: ANY_RIDER,
  deliveryRiderId: ANY_RIDER,
  pickupCityId: ANY_CITY,
  deliveryCityId: ANY_CITY,
}

/** True when at least one filter would remove something. */
export function isFiltering(filters: OngoingFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.pickupRiderId !== ANY_RIDER ||
    filters.deliveryRiderId !== ANY_RIDER ||
    filters.pickupCityId !== ANY_CITY ||
    filters.deliveryCityId !== ANY_CITY
  )
}

/**
 * Narrow board rows. All five filters combine with AND; an unset filter is
 * skipped entirely rather than compared, so a `null` `pickupCityId` (a parcel
 * whose pickup location no longer exists) is not silently dropped when the
 * pickup filter is untouched. The same holds for the rider fields: a parcel
 * with no delivery rider yet matches neither rider filter but both city ones.
 */
export function filterOngoingOrders(
  rows: Order[],
  filters: OngoingFilters,
): Order[] {
  const query = filters.query.trim().toLowerCase()
  const byPickupRider = filters.pickupRiderId !== ANY_RIDER
  const byDeliveryRider = filters.deliveryRiderId !== ANY_RIDER
  const byPickupCity = filters.pickupCityId !== ANY_CITY
  const byDeliveryCity = filters.deliveryCityId !== ANY_CITY

  if (
    query === "" &&
    !byPickupRider &&
    !byDeliveryRider &&
    !byPickupCity &&
    !byDeliveryCity
  ) {
    return rows
  }

  return rows.filter((order) => {
    if (query !== "" && !order.id.toLowerCase().includes(query)) return false
    if (byPickupRider && order.pickupRiderId !== filters.pickupRiderId) {
      return false
    }
    if (byDeliveryRider && order.deliveryRiderId !== filters.deliveryRiderId) {
      return false
    }
    if (byPickupCity && (order.pickupCityId ?? null) !== filters.pickupCityId) {
      return false
    }
    if (byDeliveryCity && order.deliveryCityId !== filters.deliveryCityId) {
      return false
    }
    return true
  })
}
