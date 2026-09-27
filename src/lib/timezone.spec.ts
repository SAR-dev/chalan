import { describe, expect, it } from "vitest"
import {
  addBusinessDays,
  BUSINESS_TIMEZONE,
  businessDateString,
  businessDayEnd,
  businessDayRange,
  businessDayStart,
  businessMonthStart,
  businessPrevMonthRange,
  businessRangeBound,
  businessToday,
} from "./timezone"

describe("businessDateString", () => {
  it("returns the Dhaka calendar day for a UTC evening instant", () => {
    // 20:00 UTC is 02:00 the next day in Dhaka (UTC+6).
    expect(businessDateString(new Date("2026-07-01T20:00:00Z"))).toBe(
      "2026-07-02",
    )
  })

  it("returns the same day for a UTC morning instant", () => {
    expect(businessDateString(new Date("2026-07-01T06:00:00Z"))).toBe(
      "2026-07-01",
    )
  })

  it("uses a fixed +06:00 offset (Asia/Dhaka has no DST)", () => {
    expect(BUSINESS_TIMEZONE).toBe("Asia/Dhaka")
    expect(businessDateString(new Date("2026-01-01T18:00:00Z"))).toBe(
      "2026-01-02",
    )
  })
})

describe("businessDayStart / businessDayEnd", () => {
  it("bounds a Dhaka day in UTC", () => {
    expect(businessDayStart("2025-01-01").toISOString()).toBe(
      "2024-12-31T18:00:00.000Z",
    )
    expect(businessDayEnd("2025-01-15").toISOString()).toBe(
      "2025-01-15T17:59:59.999Z",
    )
  })

  it("end is exactly one millisecond before the next day's start", () => {
    const end = businessDayEnd("2025-02-28")
    const nextStart = businessDayStart("2025-03-01")
    expect(nextStart.getTime() - end.getTime()).toBe(1)
  })
})

describe("businessDayRange", () => {
  it("returns inclusive UTC bounds", () => {
    expect(businessDayRange("2025-01-01", "2025-01-02")).toEqual({
      from: new Date("2024-12-31T18:00:00.000Z"),
      to: new Date("2025-01-02T17:59:59.999Z"),
    })
  })

  it("rejects malformed input", () => {
    expect(businessDayRange("nope", "2025-01-02")).toBeNull()
  })
})

describe("businessRangeBound", () => {
  it("treats a date-only value as a business day edge", () => {
    expect(businessRangeBound("2025-01-01", "start")?.toISOString()).toBe(
      "2024-12-31T18:00:00.000Z",
    )
    expect(businessRangeBound("2025-01-01", "end")?.toISOString()).toBe(
      "2025-01-01T17:59:59.999Z",
    )
  })

  it("keeps a full timestamp start but expands the end to its day", () => {
    expect(
      businessRangeBound("2025-01-01T05:00:00Z", "start")?.toISOString(),
    ).toBe("2025-01-01T05:00:00.000Z")
    expect(
      businessRangeBound("2025-01-01T05:00:00Z", "end")?.toISOString(),
    ).toBe("2025-01-01T17:59:59.999Z")
  })

  it("returns null for garbage", () => {
    expect(businessRangeBound("not-a-date", "start")).toBeNull()
  })
})

describe("date arithmetic", () => {
  it("adds and subtracts whole days", () => {
    expect(addBusinessDays("2025-01-01", -6)).toBe("2024-12-26")
    expect(addBusinessDays("2025-02-28", 1)).toBe("2025-03-01")
  })

  it("finds the month start", () => {
    expect(businessMonthStart("2025-07-15")).toBe("2025-07-01")
  })

  it("finds the previous calendar month", () => {
    expect(businessPrevMonthRange("2025-01-15")).toEqual({
      from: "2024-12-01",
      to: "2024-12-31",
    })
    expect(businessPrevMonthRange("2025-03-01")).toEqual({
      from: "2025-02-01",
      to: "2025-02-28",
    })
  })

  it("derives today from an instant", () => {
    expect(businessToday(new Date("2026-07-01T20:00:00Z"))).toBe("2026-07-02")
  })
})
