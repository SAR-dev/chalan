// =============================================================================
// When did this happen? One formatter, used everywhere.
//
// Three renderings existed at the last review: `30m` on mobile, `6:43 PM ·
// Oct 13` on desktop, `Sep 1, 2026` past a week, and the first two disagreed by
// viewport — so the same notification read differently depending on the width of
// the window. A reader comparing a phone to a laptop should see one answer.
//
// The ladder is chosen by what the reader is scanning for. Under a day, "12m" is
// the fact. Yesterday is worth naming outright. Past that, the day is enough —
// until the year changes, at which point a bare "Sep 1" is ambiguous and the
// year has to come back.
// =============================================================================

import { formatDateTime } from "@/lib/format"

/** Matches the buckets the sticky headers group by. */
export type TimeBucket = "today" | "yesterday" | "week" | "earlier"

/** Minutes since local midnight, so "yesterday" means the reader's yesterday. */
function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Whole days between two midnights, by calendar rather than by dividing an
 * elapsed duration by 86 400 000.
 *
 * Dividing is wrong across a DST boundary — a day there is 23 or 25 hours, so
 * "23 hours ago" would land in tomorrow's bucket and a header would appear above
 * rows from the day before it. Comparing midnights cannot drift.
 */
export function calendarDaysAgo(then: Date, now: Date): number {
  const a = startOfDay(then).getTime()
  const b = startOfDay(now).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function timeBucket(iso: string, now: Date = new Date()): TimeBucket {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return "earlier"

  const days = calendarDaysAgo(then, now)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 7) return "week"
  return "earlier"
}

export function formatNotificationTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ""

  const days = calendarDaysAgo(then, now)

  if (days <= 0) {
    const minutes = Math.round(
      Math.max(0, now.getTime() - then.getTime()) / 60_000,
    )
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m`
    return `${Math.floor(minutes / 60)}h`
  }

  if (days === 1) {
    // Mid-evening still reads as yesterday's evening, which is exactly what
    // "Yesterday" says — naming the hour would contradict it.
    const hours = minutesIntoDay(then) / 60
    const part = hours < 12 ? "morning" : hours < 18 ? "afternoon" : "evening"
    return `Yesterday ${part}`
  }

  const sameYear = then.getFullYear() === now.getFullYear()
  return formatDateTime(then, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}

/**
 * The full timestamp, for `title` and `<time datetime>`.
 *
 * Routed through `formatDateTime` rather than calling `toLocaleString` here: the
 * project keeps every locale call inside `lib/format.ts` — pinned to
 * `DISPLAY_LOCALE` and `BUSINESS_TIMEZONE` — so a timestamp in a tooltip cannot
 * quietly disagree with every other timestamp in the app.
 */
export function formatNotificationTimeAbsolute(iso: string): string {
  return formatDateTime(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** The header a sticky group carries. */
export function bucketLabel(bucket: TimeBucket): string {
  switch (bucket) {
    case "today":
      return "Today"
    case "yesterday":
      return "Yesterday"
    case "week":
      return "This week"
    case "earlier":
      return "Earlier"
  }
}
