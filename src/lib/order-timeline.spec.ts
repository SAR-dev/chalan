import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { formatDateTime } from "@/lib/format"
import {
  formatStamp,
  STATUS_RANK,
  STEPS,
  stepDescription,
} from "@/lib/order-timeline"
import type { OrderStatus } from "@/lib/types"

// The public tracking page and the admin order table each kept
// their own copy of the timeline, and the two `formatStamp`s disagreed about
// locale and time zone - one order could show different times for one event on
// two screens. There is now one definition; the second half of this file is
// what stops a second one being written.

describe("order timeline (ROADMAP R5.2)", () => {
  it("describes the lifecycle in six ordered steps", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "PLACED",
      "APPROVED",
      "PICKED_UP",
      "IN_WAREHOUSE",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ])
    expect(STEPS.map((s) => s.rank)).toEqual([0, 1, 2, 3, 4, 5])
    for (const step of STEPS) {
      expect(step.label, `${step.key} needs a label`).toBeTruthy()
      expect(step.description, `${step.key} needs a description`).toBeTruthy()
      expect(step.icon, `${step.key} needs an icon`).toBeTruthy()
    }
  })

  // Ranks are what "which step is current" is computed from, so a status left
  // out is a status that renders as "step 0" rather than throwing.
  it("ranks every order status", () => {
    const statuses: OrderStatus[] = [
      "PENDING",
      "APPROVED",
      "PICKED_UP",
      "IN_WAREHOUSE",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FAILED_ATTEMPT",
      "RETURNED",
      "CANCELLED",
    ]
    expect(Object.keys(STATUS_RANK).sort()).toEqual([...statuses].sort())
    for (const status of statuses) {
      expect(STATUS_RANK[status], `${status} has no rank`).toBeTypeOf("number")
    }
  })

  it("gives the recipient the wording that addresses them", () => {
    const outForDelivery = STEPS.find((s) => s.key === "OUT_FOR_DELIVERY")!
    expect(stepDescription(outForDelivery, "recipient")).toBe(
      "Rider is heading to you now",
    )
    // The ops table speaks *about* the recipient, so it never says "you".
    expect(stepDescription(outForDelivery, "ops")).toBe(
      "Rider is heading to the recipient",
    )

    // Every other step reads the same either way - the voice only exists
    // because these two happen to differ.
    for (const step of STEPS.filter((s) => s.key !== "OUT_FOR_DELIVERY")) {
      expect(stepDescription(step, "recipient")).toBe(step.description)
    }
  })

  it("formats a stamp exactly as the shared formatter does", () => {
    // A pass-through contract rather than a rendered shape: shapes like
    // "2 AM" are `Intl`'s business, and the bug this replaced was the two
    // implementations disagreeing with each other.
    const iso = "2026-03-04T09:05:00.000Z"
    const options = {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    } as const
    expect(formatStamp(iso)).toBe(formatDateTime(new Date(iso), options))
    expect(formatStamp(new Date(iso))).toBe(
      formatDateTime(new Date(iso), options),
    )
  })

  it("returns null rather than the string Invalid Date for junk", () => {
    expect(formatStamp(undefined)).toBeNull()
    expect(formatStamp(null)).toBeNull()
    expect(formatStamp("")).toBeNull()
    expect(formatStamp("not a date")).toBeNull()
  })
})

describe("the timeline has exactly one definition (ROADMAP R5.2)", () => {
  const consumers = [
    "src/app/track/[id]/lib.ts",
    "src/features/orders/components/tracking-timeline.tsx",
  ]

  /**
   * Anything that *declares* one of these rather than importing it. Anchored
   * on the declaration keyword, so a mention in a comment or an import line
   * does not count.
   */
  const declarations = [
    /(^|\n)\s*type StepKey\s*=/,
    /(^|\n)\s*const STATUS_RANK\s*:/,
    /(^|\n)\s*(const|export const) STEPS\s*[:=]/,
    /(^|\n)\s*(function|export function) formatStamp\s*\(/,
  ]

  for (const file of consumers) {
    it(`keeps ${file} a re-export, not a second copy`, () => {
      const raw = readFileSync(join(process.cwd(), file), "utf-8")
      for (const pattern of declarations) {
        expect(
          pattern.test(raw),
          `${file} declares its own definition - it belongs in src/lib/order-timeline.ts`,
        ).toBe(false)
      }
      // …and it must still reach the shared one.
      expect(raw).toContain("@/lib/order-timeline")
    })
  }
})
