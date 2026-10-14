import { describe, expect, it } from "vitest"
import {
  bucketLabel,
  calendarDaysAgo,
  formatNotificationTime,
  formatNotificationTimeAbsolute,
  timeBucket,
} from "@/lib/notification-time"

// Three renderings existed at the last review — `30m` on mobile, `6:43 PM ·
// Oct 13` on desktop, `Sep 1, 2026` past a week — and the first two disagreed by
// viewport, so the same notification read differently depending on the width of
// the window. These pin the single ladder that replaced them.
describe("formatNotificationTime", () => {
  // Built in local time on purpose. The formatter buckets by the *reader's*
  // calendar, so a test that pins UTC instants asserts the wrong thing wherever
  // it runs — `18:43Z` is the previous morning in Dhaka and the same evening in
  // Lisbon. Local constructors pin the day and the hour being claimed.
  const now = new Date(2026, 9, 13, 18, 43)
  const at = (d: number, h: number, m = 0) =>
    new Date(2026, 9, d, h, m).toISOString()

  it("uses minutes under the first hour", () => {
    expect(formatNotificationTime(at(13, 18, 13), now)).toBe("30m")
    expect(formatNotificationTime(at(13, 18, 41), now)).toBe("2m")
  })

  it("says just now rather than 0m", () => {
    expect(formatNotificationTime(at(13, 18, 43), now)).toBe("just now")
  })

  it("switches to hours inside the same day", () => {
    expect(formatNotificationTime(at(13, 15, 43), now)).toBe("3h")
  })

  it("names yesterday and its part of the day, not an hour", () => {
    // "19 hours ago" would put an evening event in the wrong bucket for a reader
    // scanning for it this morning.
    expect(formatNotificationTime(at(12, 19), now)).toBe("Yesterday evening")
    expect(formatNotificationTime(at(12, 9), now)).toBe("Yesterday morning")
    expect(formatNotificationTime(at(12, 14), now)).toBe("Yesterday afternoon")
  })

  it("gives the day and month once it is past yesterday", () => {
    const out = formatNotificationTime(at(9, 9), now)
    expect(out).toMatch(/Oct/)
    expect(out).not.toMatch(/2026/)
  })

  it("adds the year only when it differs from today", () => {
    const lastYear = new Date(2025, 2, 2, 9).toISOString()
    expect(formatNotificationTime(lastYear, now)).toMatch(/Mar 2, 2025/)
  })

  it("returns an empty string rather than Invalid Date", () => {
    expect(formatNotificationTime("not-a-date", now)).toBe("")
    expect(formatNotificationTimeAbsolute("not-a-date")).toBe("")
  })
})

describe("calendarDaysAgo", () => {
  it("compares midnights, not elapsed hours", () => {
    // 23:00 today to 01:00 tomorrow is two hours but one calendar day. Dividing
    // by 86_400_000 would call it a day ago; comparing midnights cannot.
    const then = new Date(2026, 9, 12, 23, 0)
    const today = new Date(2026, 9, 13, 1, 0)
    expect(calendarDaysAgo(then, today)).toBe(1)
  })

  it("treats the same day as zero even across 23 hours", () => {
    expect(
      calendarDaysAgo(
        new Date(2026, 9, 13, 0, 5),
        new Date(2026, 9, 13, 23, 0),
      ),
    ).toBe(0)
  })
})

describe("timeBucket", () => {
  const now = new Date(2026, 9, 13, 18, 0)

  it("buckets by calendar day", () => {
    expect(timeBucket("2026-10-13T06:00:00Z", now)).toBe("today")
    expect(timeBucket("2026-10-12T06:00:00Z", now)).toBe("yesterday")
    expect(timeBucket("2026-10-09T06:00:00Z", now)).toBe("week")
    expect(timeBucket("2026-06-01T06:00:00Z", now)).toBe("earlier")
  })

  it("has a label for every bucket", () => {
    for (const b of ["today", "yesterday", "week", "earlier"] as const) {
      expect(bucketLabel(b)).toMatch(/\S/)
    }
  })

  it("sends an unparseable date to the oldest bucket, not a crash", () => {
    expect(timeBucket("not-a-date", now)).toBe("earlier")
  })
})
