import {
  addBusinessDays,
  businessDateString,
  businessDayEnd,
  businessDaysBetween,
} from "@/lib/timezone"

/**
 * The delivery promise, and how a parcel did against it.
 *
 * Deliberately free of any database import. `order-delivery-time.ts` resolves
 * the zone matrix and therefore pulls in `db` (and `pg`, and the `net`/`dns`
 * sockets `pg` needs) — which is fine for a server route and fatal for a client
 * component, where Turbopack would fail the build with "Can't resolve 'net'".
 * The tracking page and the order drawer need only the arithmetic, so the
 * arithmetic lives here on its own. The same rule is why `order-timeline.ts`
 * exists separately from `track/[id]/lib.ts`.
 */

/**
 * The instant the parcel is promised by: **end of** the Nth Dhaka day after the
 * day the order was created.
 *
 * End of day rather than creation-plus-N-days, because "expected by 9 Oct"
 * means any time on the 9th counts — a parcel collected at 18:00 on the day it
 * was due is not late. Storing the end instant keeps the late/on-time test a
 * single comparison against `deliveredAt` with no calendar maths at read time.
 *
 * Null when `days` is null: no configured delivery time means no promise, not a
 * guessed one.
 */
export function computeExpectedDeliveryAt(
  createdAt: string,
  days: number | null | undefined,
): string | null {
  if (days === null || days === undefined || days < 0) return null
  const created = toDateOrNull(createdAt)
  // Format *after* validating: `businessDateString` throws a RangeError on an
  // Invalid Date rather than returning one, so checking the string it produced
  // would be checking too late.
  if (!created) return null
  return businessDayEnd(
    addBusinessDays(businessDateString(created), days),
  ).toISOString()
}

function toDateOrNull(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Whole days between creation and delivery, in Dhaka days.
 *
 * The counterpart to `computeExpectedDeliveryAt`: it answers "how many days did
 * it actually take", on the same calendar the promise was quoted on, so the two
 * numbers are directly comparable rather than one being UTC-days and the other
 * business-days.
 *
 * Returns `null` — not `0` — when either end is missing or unparseable. `0`
 * means "delivered the same day it was created", which is a real answer; null
 * means we do not have one, and conflating them would make an unmeasurable
 * delivery look instant.
 */
export function computeActualDeliveryDays(
  createdAt: string,
  deliveredAt: string,
): number | null {
  const from = toDateOrNull(createdAt)
  const to = toDateOrNull(deliveredAt)
  if (!from || !to) return null
  return businessDaysBetween(businessDateString(from), businessDateString(to))
}

/**
 * How a delivered parcel did against its promise, as one sentence fragment:
 * `"3 days late"`, `"on time"`, `"early"`, `"delivered in 5 days"`.
 *
 * Lives here rather than in each component because the same three words have to
 * mean the same thing on the order detail, the merchant's list and the public
 * tracking page — three surfaces that would otherwise each grow their own idea
 * of whether a parcel was late.
 *
 * Returns `null` when nothing was measured: an undelivered parcel has no
 * outcome yet, and saying "on time" about it would be a guess.
 */
export function deliveryOutcome(
  actualDays: number | null | undefined,
  expectedDays: number | null | undefined,
): string | null {
  if (actualDays === null || actualDays === undefined) return null

  const span = (n: number) =>
    `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`

  // No promise was ever quoted, so there is nothing to be late against — the
  // elapsed time is still worth stating, except for a same-day delivery where
  // "0 days" would read as a non-answer.
  if (expectedDays === null || expectedDays === undefined) {
    return actualDays === 0
      ? "delivered the same day"
      : `delivered in ${span(actualDays)}`
  }

  const delta = actualDays - expectedDays
  if (delta === 0) return "on time"
  return delta > 0 ? `${span(delta)} late` : `${span(delta)} early`
}
