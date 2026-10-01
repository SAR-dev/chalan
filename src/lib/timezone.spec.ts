import { describe, expect, it } from "vitest"
import {
  addBusinessDays,
  BUSINESS_TIMEZONE,
  businessDateString,
  businessDayEnd,
  businessDayRange,
  businessDayStart,
  businessMonthStart,
  businessPresetRange,
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

describe("businessPresetRange (ROADMAP R0.3)", () => {
  // 20:00 UTC is 02:00 the next day in Dhaka — the instant where a device-local
  // derivation and a Dhaka derivation disagree by a whole calendar day.
  const instant = new Date("2026-07-01T20:00:00Z")

  it("'today' is the Dhaka day, not the UTC day", () => {
    const { from, to } = businessPresetRange("today", instant)
    expect(from).toBe("2026-07-02")
    expect(to).toBe("2026-07-02")
    // Guards the shortcut that caused the bug: the UTC calendar day.
    expect(from).not.toBe(instant.toISOString().slice(0, 10))
  })

  it("'yesterday' is the Dhaka day before it", () => {
    expect(businessPresetRange("yesterday", instant)).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    })
  })

  it("'last7' is seven inclusive Dhaka days ending today", () => {
    expect(businessPresetRange("last7", instant)).toEqual({
      from: "2026-06-26",
      to: "2026-07-02",
    })
  })

  it("returns date-only strings for the server to expand", () => {
    // The server's `businessRangeBound` applies the Dhaka edge only for a
    // `YYYY-MM-DD`; an ISO instant here would be taken at face value.
    for (const preset of ["today", "yesterday", "last7"] as const) {
      const { from, to } = businessPresetRange(preset, instant)
      expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  // The presets previously used `setHours(0,0,0,0)` on the device clock, so the
  // answer depended on where the browser was. Pinning TZ proves the result does
  // not move with the host.
  it("does not move with the host timezone", () => {
    const previous = process.env.TZ
    try {
      const results = new Set<string>()
      const localDays = new Set<string>()
      for (const tz of ["America/New_York", "Asia/Tokyo", "UTC"]) {
        process.env.TZ = tz
        results.add(businessPresetRange("today", instant).from)
        // Self-check: if these three agree the host zone never changed, and the
        // assertion below would be proving nothing. For 20:00Z New York and UTC
        // see the 1st while Tokyo already sees the 2nd.
        localDays.add(instant.getDate().toString())
      }
      expect(localDays.size).toBeGreaterThan(1)
      expect([...results]).toEqual(["2026-07-02"])
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
})
