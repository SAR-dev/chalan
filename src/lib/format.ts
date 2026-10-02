import { CURRENCY_SUFFIX } from "@/lib/constants"
import { BUSINESS_TIMEZONE } from "@/lib/timezone"

// =============================================================================
// Display formatting
//
// There were ~29 `toLocaleString` / `toLocaleDateString` call sites across 25
// files, none of which passed a `timeZone`. Everything therefore rendered in
// the *browser's* zone — correct for a Dhaka user, wrong for anyone else, and
// worse where the value is produced on the server: `track/[id]/lib.ts` hard
// coded `en-US` and ran server-side, so a customer and an ops user in the same
// office could read different times for one order, while
// `tracking-timeline.tsx` rendered the same timeline with a third setting.
//
// The app already has an authoritative zone — `BUSINESS_TIMEZONE`, used for day
// boundaries and the DB session — so display simply follows it. Explicit locale
// too: `"en-US"` was reached by accident (a bare `undefined` is whatever the
// host happens to be), and number grouping is part of the product's look.
// =============================================================================

/** Locale every rendered number and date uses. Matching `formatTk`'s grouping. */
export const DISPLAY_LOCALE = "en-US"

/**
 * Options that ask for the clock rather than the calendar.
 *
 * `toLocaleDateString` throws `TypeError: Invalid option : <name>` on every one
 * of these, so they are also what decides which method to call. Checking only
 * `hour`/`minute` is not enough: the `{ dateStyle, timeStyle }` pair — the shape
 * most call sites actually want, and the one the merchant order page uses —
 * reveals nothing through those two keys, so it was routed to the date-only
 * method and took the page's error boundary with it (E2E S61).
 */
const TIME_ONLY_OPTIONS = [
  "timeStyle",
  "dayPeriod",
  "hour",
  "minute",
  "second",
  "fractionalSecondDigits",
] as const

function asksForClock(options: Intl.DateTimeFormatOptions): boolean {
  return TIME_ONLY_OPTIONS.some((key) => options[key] !== undefined)
}

/**
 * Render a date for display, in the business timezone.
 *
 * Accepts an ISO string, a `Date`, or `null`/`undefined`.
 *
 * Whether a time is shown follows the options: pass anything from
 * `TIME_ONLY_OPTIONS` (`hour`/`minute`, or the `timeStyle` half of a
 * `dateStyle`+`timeStyle` pair) and you get date *and* time; omit them and you
 * get a date only. That mirrors the two functions this replaces
 * (`toLocaleDateString` and `toLocaleString`) without every call site having to
 * pick one — a caller asking for `month`/`day` alone never wants "14/7, 03:30"
 * appended.
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (value === null || value === undefined || value === "") return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const opts: Intl.DateTimeFormatOptions = {
    timeZone: BUSINESS_TIMEZONE,
    ...options,
  }
  return asksForClock(options)
    ? date.toLocaleString(DISPLAY_LOCALE, opts)
    : date.toLocaleDateString(DISPLAY_LOCALE, opts)
}

/**
 * Render an amount as `<number> TK`.
 *
 * Money is `numeric(14,2)` and arrives as a JS `number` (`money()` in
 * `schema.postgres/helpers.ts`), so this only formats. Kept as the one place
 * the locale and the suffix are joined — `formatTk` in `lib/pricing.ts` is the
 * public name callers already use and delegates here.
 */
export function formatMoney(
  amount: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return `${amount.toLocaleString(DISPLAY_LOCALE, options)} ${CURRENCY_SUFFIX}`
}

/**
 * The local display suffix (`TK`).
 *
 * Deliberately *not* the same thing as `appContent.CURRENCY` (`"BDT"`): that
 * one is the ISO code rendered into the Terms and Privacy documents via the
 * `{{CURRENCY}}` token, where a jurisdiction-facing document wants the standard
 * code rather than a colloquial suffix. Two values, two audiences — not the
 * duplicate they were mistaken for.
 */
export { CURRENCY_SUFFIX }
