import { describe, expect, it } from "vitest"
import {
  computeActualDeliveryDays,
  computeExpectedDeliveryAt,
  deliveryOutcome,
} from "./delivery-promise"

// The business zone is Asia/Dhaka (UTC+6) and every day boundary in this module
// is a *Dhaka* boundary, so 18:00Z is midnight there â€” the exact hour where a
// UTC shortcut would quote a promise a day early.
describe("computeExpectedDeliveryAt", () => {
  it("promises the end of the Nth Dhaka day after creation", () => {
    expect(computeExpectedDeliveryAt("2026-10-05T10:00:00.000Z", 3)).toBe(
      "2026-10-08T17:59:59.999Z",
    )
    expect(computeExpectedDeliveryAt("2026-10-05T10:00:00.000Z", 0)).toBe(
      "2026-10-05T17:59:59.999Z",
    )
  })

  it("takes the Dhaka day, not the UTC day", () => {
    // 18:30Z on the 5th is already 00:30 on the 6th in Dhaka, so a same-day
    // promise falls on the 6th â€” `createdAt.slice(0, 10)` would say the 5th.
    expect(computeExpectedDeliveryAt("2026-10-05T18:30:00.000Z", 0)).toBe(
      "2026-10-06T17:59:59.999Z",
    )
  })

  it("quotes nothing when no time is configured", () => {
    // A missing estimate is honest; a zero or a guess is not.
    expect(
      computeExpectedDeliveryAt("2026-10-05T10:00:00.000Z", null),
    ).toBeNull()
    expect(
      computeExpectedDeliveryAt("2026-10-05T10:00:00.000Z", undefined),
    ).toBeNull()
    expect(computeExpectedDeliveryAt("2026-10-05T10:00:00.000Z", -1)).toBeNull()
  })

  it("returns null rather than throwing on an unusable date", () => {
    // `businessDateString` throws a RangeError on an Invalid Date â€” a malformed
    // created-at must not take down order creation.
    expect(computeExpectedDeliveryAt("", 3)).toBeNull()
    expect(computeExpectedDeliveryAt("not-a-date", 3)).toBeNull()
    expect(
      computeExpectedDeliveryAt(undefined as unknown as string, 3),
    ).toBeNull()
  })
})

describe("computeActualDeliveryDays", () => {
  it("counts whole Dhaka days between creation and delivery", () => {
    expect(
      computeActualDeliveryDays(
        "2026-10-05T10:00:00.000Z",
        "2026-10-08T10:00:00.000Z",
      ),
    ).toBe(3)
    expect(
      computeActualDeliveryDays(
        "2026-10-05T10:00:00.000Z",
        "2026-10-05T10:00:00.000Z",
      ),
    ).toBe(0)
  })

  it("uses the Dhaka day at both ends, so neither edge is shifted", () => {
    // Created 00:30 Dhaka on the 6th (18:30Z on the 5th), delivered midday on
    // the 7th: one Dhaka day apart, though the UTC dates differ by two.
    expect(
      computeActualDeliveryDays(
        "2026-10-05T18:30:00.000Z",
        "2026-10-07T12:00:00.000Z",
      ),
    ).toBe(1)
  })

  it("returns null, not zero, when either end is unknown", () => {
    // Zero is a real answer â€” "same day". Null means we cannot measure it, and
    // treating them alike would make an unmeasured delivery look instant.
    expect(computeActualDeliveryDays("", "2026-10-08T10:00:00.000Z")).toBeNull()
    expect(
      computeActualDeliveryDays("2026-10-05T10:00:00.000Z", "junk"),
    ).toBeNull()
    expect(
      computeActualDeliveryDays(null as never, "2026-10-08T10:00:00.000Z"),
    ).toBeNull()
  })
})

describe("deliveryOutcome", () => {
  it("says how far past the promise a delivery was", () => {
    expect(deliveryOutcome(5, 2)).toBe("3 days late")
    expect(deliveryOutcome(3, 2)).toBe("1 day late")
  })

  it("says on time and early without counting days twice", () => {
    expect(deliveryOutcome(2, 2)).toBe("on time")
    expect(deliveryOutcome(1, 3)).toBe("2 days early")
  })

  it("still states the elapsed time when no promise existed", () => {
    expect(deliveryOutcome(5, null)).toBe("delivered in 5 days")
    expect(deliveryOutcome(0, null)).toBe("delivered the same day")
  })

  it("has no outcome until the parcel is delivered", () => {
    // Null, not "on time": an undelivered parcel has no result yet, and
    // claiming one would be a promise masquerading as a measurement.
    expect(deliveryOutcome(null, 2)).toBeNull()
    expect(deliveryOutcome(null, null)).toBeNull()
  })
})
