import { describe, expect, it } from "vitest"
import { notificationStatus } from "@/lib/notification-status"

// Every step of one order carries the same title, so the title alone cannot tell
// a delivered parcel from a cancelled one. This is the readable form of the event
// that was already on the row.
describe("notificationStatus", () => {
  it("names each lifecycle step in words, not only in colour", () => {
    expect(notificationStatus("order.created")?.label).toBe("New")
    expect(notificationStatus("order.delivered")?.label).toBe("Delivered")
    expect(notificationStatus("order.cancelled")?.label).toBe("Cancelled")
  })

  it("separates money events from parcel updates", () => {
    // `cash.submitted` and `payout.approved` reuse tones the order statuses
    // use, so a payout and a delivered parcel looked identical.
    expect(notificationStatus("cash.submitted")?.kind).toBe("money")
    expect(notificationStatus("payout.approved")?.kind).toBe("money")
    expect(notificationStatus("order.delivered")?.kind).toBe("lifecycle")
  })

  it("returns null for an event this build does not know", () => {
    // `event` is plain text in the database, so a newer deploy can write a value
    // an older build has never seen. Guessing a status would be worse than none.
    expect(notificationStatus("order.teleported")).toBeNull()
    expect(notificationStatus("")).toBeNull()
  })

  it("gives every known event a non-empty label and a tone", () => {
    // A chip with no words is decoration pretending to be information.
    for (const event of [
      "order.created",
      "order.approved",
      "order.picked-up",
      "order.dispatched",
      "order.out-for-delivery",
      "order.delivered",
      "order.failed",
      "order.returned",
      "order.cancelled",
      "cash.submitted",
      "payout.approved",
    ]) {
      const status = notificationStatus(event)
      expect(status, event).not.toBeNull()
      expect(status?.label.length ?? 0, event).toBeGreaterThan(0)
      expect(status?.tone, event).toBeTruthy()
    }
  })
})
