import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatNotificationTime } from "@/features/notifications/components/notification-inbox"

/**
 * The inbox renders two forms of the same timestamp: absolute on desktop,
 * compact on a phone. The compact one exists because the absolute form costs
 * ~120px, which on a 390px viewport took the title down to "New order rece…" —
 * the only text on the row that says what happened.
 */
const NOW = "2026-10-13T12:43:00Z"

describe("formatNotificationTime", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the clock and the day for anything inside the week", () => {
    expect(formatNotificationTime(NOW)).toMatch(
      /^\d{1,2}:\d{2}\s?[AP]M · Oct 13$/,
    )
    expect(formatNotificationTime("2026-10-11T09:00:00Z")).toMatch(
      /^\d{1,2}:\d{2}\s?[AP]M · Oct 11$/,
    )
  })

  it("drops the clock once the row is older than a week", () => {
    expect(formatNotificationTime("2026-09-01T12:43:00Z")).toBe("Sep 1, 2026")
  })

  it("keeps the compact form to a short relative label", () => {
    expect(formatNotificationTime(NOW, true)).toBe("just now")
    expect(formatNotificationTime("2026-10-13T12:13:00Z", true)).toBe("30m")
    expect(formatNotificationTime("2026-10-13T09:43:00Z", true)).toBe("3h")
    expect(formatNotificationTime("2026-10-11T12:43:00Z", true)).toBe("2d")
  })

  it("falls back to the absolute date when a relative label would be ambiguous", () => {
    // 73d is not a useful thing to put in a notification column.
    expect(formatNotificationTime("2026-08-01T12:00:00Z", true)).toBe(
      "Aug 1, 2026",
    )
  })

  it("clamps a future timestamp rather than reporting a negative age", () => {
    // Clock skew between app and database servers must not render "-2m".
    expect(formatNotificationTime("2026-10-13T12:45:00Z", true)).toBe(
      "just now",
    )
  })

  it("degrades to an empty-ish column rather than NaN for an invalid date", () => {
    expect(formatNotificationTime("not-a-date")).not.toContain("NaN")
    expect(formatNotificationTime("not-a-date", true)).not.toContain("NaN")
  })
})
