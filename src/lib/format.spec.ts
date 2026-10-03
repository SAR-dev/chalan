import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DISPLAY_LOCALE, formatDateTime, formatMoney } from "@/lib/format"
import { BUSINESS_TIMEZONE } from "@/lib/timezone"

// ~29 `toLocale*` call sites across 25 files, none of which
// passed a `timeZone`, so every rendered date was whatever zone the renderer
// happened to run in — server for the public track page, browser everywhere
// else, and *three* different settings for the same timeline.

const ORIGINAL_TZ = process.env.TZ

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
})

describe("formatDateTime (ROADMAP R3.3)", () => {
  it("renders in the business timezone, not the host's", () => {
    // Force the host to UTC: without an explicit `timeZone` this value lands
    // on Jan 1, but Dhaka is UTC+6 so the business date is Jan 2. Any revert
    // of the `timeZone` pin fails this on *any* machine, not just CI's.
    process.env.TZ = "UTC"
    const rendered = formatDateTime("2025-01-01T20:00:00Z", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    expect(BUSINESS_TIMEZONE).toBe("Asia/Dhaka")
    expect(rendered).toContain("Jan 2")
    expect(rendered).not.toContain("Jan 1")
  })

  it("omits the clock unless time options are asked for", () => {
    process.env.TZ = "UTC"
    const dateOnly = formatDateTime("2025-01-01T20:00:00Z", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    expect(dateOnly).not.toMatch(/\d:\d\d/)

    const withTime = formatDateTime("2025-01-01T20:00:00Z", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    expect(withTime).toMatch(/\d:\d\d/)
    expect(withTime).toContain("Jan 2")
  })

  /**
   * Regression: `toLocaleDateString` throws `TypeError: Invalid option :
   * timeStyle` on *any* time option, so routing is decided by more than
   * `hour`/`minute`. `{ dateStyle, timeStyle }` looks date-only through those
   * two keys, went to `toLocaleDateString`, and crashed the merchant order page
   * into its error boundary (E2E S61).
   *
   * The assertion is a pass-through contract rather than a rendered shape:
   * whatever the caller asked for must come back from the matching `Intl`
   * method, options unchanged. Shapes are unreliable to assert on — `hour`
   * alone legitimately renders "2 AM", `second` alone "0" — so pinning them
   * would encode `Intl`'s quirks instead of this function's contract.
   */
  it("routes by option kind, passing options through untouched", () => {
    const value = "2025-01-01T20:00:00Z"
    const date = new Date(value)
    const pinned = (o: Intl.DateTimeFormatOptions) => ({
      timeZone: BUSINESS_TIMEZONE,
      ...o,
    })

    const timeOptions: Intl.DateTimeFormatOptions[] = [
      { dateStyle: "medium", timeStyle: "short" },
      { timeStyle: "short" },
      { dayPeriod: "short" },
      { second: "2-digit" },
      { fractionalSecondDigits: 3 },
      { hour: "numeric" },
      { minute: "2-digit" },
    ]
    for (const options of timeOptions) {
      const label = JSON.stringify(options)
      expect(() => formatDateTime(value, options), label).not.toThrow()
      expect(formatDateTime(value, options), label).toBe(
        date.toLocaleString(DISPLAY_LOCALE, pinned(options)),
      )
    }

    // And the date-only half must still avoid the time formatter, or callers
    // asking for "14/7" would get a clock they did not want.
    for (const options of [
      { year: "numeric", month: "short", day: "numeric" },
      { dateStyle: "medium" },
      { dateStyle: "full" },
      {},
    ] satisfies Intl.DateTimeFormatOptions[]) {
      const label = JSON.stringify(options)
      expect(formatDateTime(value, options), label).toBe(
        date.toLocaleDateString(DISPLAY_LOCALE, pinned(options)),
      )
    }
  })

  it("still renders the shape the merchant order page asks for", () => {
    // The exact options `order-details-content.tsx` passes for "Placed …".
    const rendered = formatDateTime("2025-01-01T20:00:00Z", {
      dateStyle: "medium",
      timeStyle: "short",
    })
    // Jan 2 in Dhaka, not Jan 1 — so the zone pin survives the style path too.
    expect(rendered).toContain("Jan 2")
    expect(rendered).toMatch(/\d:\d\d/)
  })

  it("uses an explicit locale rather than the host's", () => {
    expect(DISPLAY_LOCALE).toBe("en-US")
    // en-US groups with commas: 1,234 — a host locale would not.
    expect(formatMoney(1234.5)).toBe("1,234.5 TK")
    expect(formatMoney(1234.5, { maximumFractionDigits: 2 })).toBe("1,234.5 TK")
  })

  it("returns an empty string for absent or unparseable input", () => {
    expect(formatDateTime(null)).toBe("")
    expect(formatDateTime(undefined)).toBe("")
    expect(formatDateTime("")).toBe("")
    expect(formatDateTime("not a date")).toBe("")
  })
})

/**
 * Guards the codemod itself: every rendered date must go through
 * `formatDateTime`, because a hand-written `toLocale*` silently drops both
 * pins (zone and locale) and no type system will notice.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full) && !/\.spec\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

describe("no un-pinned date rendering survives", () => {
  it("keeps every toLocale* call inside src/lib/format.ts", () => {
    const offenders: string[] = []
    for (const file of walk(join(process.cwd(), "src"))) {
      const rel = relative(process.cwd(), file).split(sep).join("/")
      if (rel === "src/lib/format.ts") continue
      const lines = readFileSync(file, "utf-8").split("\n")
      lines.forEach((line, i) => {
        if (/\.toLocale(String|DateString|TimeString)\(/.test(line)) {
          offenders.push(`${rel}:${i + 1} | ${line.trim()}`)
        }
      })
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})
