/**
 * Business timezone.
 *
 * The business runs in Asia/Dhaka (UTC+6), but containers and the database
 * default to UTC, so "today", date-range filters and day-bucketed reports were
 * off by up to six hours. All business-day math goes through this module:
 *
 *   - date-range filters (`parseDateRange`) bound the Dhaka calendar day,
 *   - analytics group with `AT TIME ZONE` (see `db/time-sql.ts`),
 *   - the DB session timezone is pinned in `db/index.ts`,
 *   - the date picker formats in this zone regardless of the browser's.
 *
 * The value is a constant (not env-driven) so the client and server always
 * agree; changing it is a deliberate code change + rebuild.
 */
export const BUSINESS_TIMEZONE = "Asia/Dhaka"

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Format an instant as the business-local `YYYY-MM-DD` (default: now). */
export function businessDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** The zone's offset from UTC, in milliseconds, at a given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  // Strip the instant's milliseconds so the comparison is second-precision.
  return asUtc - (date.getTime() - date.getMilliseconds())
}

/** UTC instant of the first millisecond of a business day. */
export function businessDayStart(date: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const utcMidnight = Date.UTC(y, m - 1, d)
  // Two passes so a DST transition at local midnight settles.
  let ts = utcMidnight - zoneOffsetMs(new Date(utcMidnight), BUSINESS_TIMEZONE)
  ts = utcMidnight - zoneOffsetMs(new Date(ts), BUSINESS_TIMEZONE)
  return new Date(ts)
}

/** UTC instant of the last millisecond of a business day. */
export function businessDayEnd(date: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  const nextDate = formatUtcDate(next)
  return new Date(businessDayStart(nextDate).getTime() - 1)
}

/** Inclusive UTC range for a business-day range (null when malformed). */
export function businessDayRange(
  from: string,
  to: string,
): { from: Date; to: Date } | null {
  if (!isDateOnly(from) || !isDateOnly(to)) return null
  return { from: businessDayStart(from), to: businessDayEnd(to) }
}

/**
 * Parse one end of a date-range filter. A `YYYY-MM-DD` is a business day; a
 * full timestamp keeps its instant as the lower bound but expands to the end
 * of its business day as the upper bound. Returns null when unparseable.
 */
export function businessRangeBound(
  raw: string,
  edge: "start" | "end",
): Date | null {
  if (isDateOnly(raw)) {
    const bound = edge === "start" ? businessDayStart(raw) : businessDayEnd(raw)
    return Number.isNaN(bound.getTime()) ? null : bound
  }
  const instant = new Date(raw)
  if (Number.isNaN(instant.getTime())) return null
  return edge === "start"
    ? instant
    : businessDayEnd(businessDateString(instant))
}

/** Today as a business-local `YYYY-MM-DD`. */
export function businessToday(now: Date = new Date()): string {
  return businessDateString(now)
}

/** Add (or subtract) whole days from a `YYYY-MM-DD` string. */
export function addBusinessDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return formatUtcDate(new Date(Date.UTC(y, m - 1, d + days)))
}

/**
 * Whole days from one business date to another (negative when `to` is earlier).
 *
 * Both ends are `YYYY-MM-DD` already, so this is pure calendar arithmetic — no
 * zone offset enters, and neither end's time of day can shift the count by one.
 * That is the point: an order created at 23:30 Dhaka and delivered two days
 * later at 01:00 took two days, not one, and not three.
 *
 * Distinguished from a timestamp difference by using `businessDayStart`-style
 * date parsing rather than `Date` subtraction, which would compare instants in
 * whatever zone the values happened to carry.
 */
export function businessDaysBetween(from: string, to: string): number {
  if (!isDateOnly(from) || !isDateOnly(to)) return 0
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(ms / 86_400_000)
}

/**
 * Inclusive business-day range for a quick-filter preset.
 *
 * Returns `YYYY-MM-DD` strings, not instants: the server expands each end
 * through `businessRangeBound`, so the Dhaka boundary is applied exactly once,
 * server-side, and the browser's own zone never enters the calculation. An
 * instant computed here would land on the *device's* midnight — up to six hours
 * Off, which is enough for "Today" to include or drop orders at
 * the edges and disagree with the totals shown above the same table.
 *
 * Mirrors `DateRangePicker.applyPreset`, which already worked this way.
 */
export type BusinessDatePreset = "today" | "yesterday" | "last7"

export function businessPresetRange(
  preset: BusinessDatePreset,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = businessToday(now)
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const yesterday = addBusinessDays(today, -1)
      return { from: yesterday, to: yesterday }
    }
    case "last7":
      // Inclusive of today, matching DateRangePicker's "Last 7 days".
      return { from: addBusinessDays(today, -6), to: today }
  }
}

/** First day of the month containing `date`, as `YYYY-MM-DD`. */
export function businessMonthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** The whole previous calendar month, as `{ from, to }` business dates. */
export function businessPrevMonthRange(date: string): {
  from: string
  to: string
} {
  const [y, m] = date.split("-").map(Number)
  return {
    from: formatUtcDate(new Date(Date.UTC(y, m - 2, 1))),
    to: formatUtcDate(new Date(Date.UTC(y, m - 1, 0))),
  }
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
