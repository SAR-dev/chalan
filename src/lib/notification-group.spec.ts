import { describe, expect, it } from "vitest"
import {
  type GroupableNotification,
  groupNotifications,
} from "@/lib/notification-group"

const row = (
  over: Partial<GroupableNotification> & { id: string },
): GroupableNotification => ({
  event: "order.created",
  orderId: "ORD-1",
  title: "New order received",
  href: "/merchant/orders/ORD-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  actorName: null,
  ...over,
})

describe("groupNotifications", () => {
  it("collapses every fact about one order into a single row", () => {
    // The complaint this fixes: an order emits an event per lifecycle step, so
    // an ungrouped inbox showed the same order six times.
    const groups = groupNotifications([
      row({ id: "n1", event: "order.delivered", title: "Order delivered" }),
      row({ id: "n2", event: "order.dispatched", title: "Order dispatched" }),
      row({ id: "n3", event: "order.created", title: "New order received" }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: "ORD-1",
      orderId: "ORD-1",
      count: 3,
      ids: ["n1", "n2", "n3"],
    })
  })

  it("heads the group with the newest fact, not the first one seen", () => {
    // The representative row is what the merchant wants to know: where the
    // parcel is now. The input contract is newest-first, which is what
    // `getNotificationsForUser` orders by.
    const groups = groupNotifications([
      row({ id: "new", event: "order.delivered", title: "Order delivered" }),
      row({ id: "old", event: "order.created", title: "New order received" }),
    ])

    expect(groups[0].title).toBe("Order delivered")
    expect(groups[0].event).toBe("order.delivered")
    expect(groups[0].href).toBe("/merchant/orders/ORD-1")
  })

  it("keeps separate orders apart", () => {
    const groups = groupNotifications([
      row({ id: "a1", orderId: "ORD-1" }),
      row({ id: "b1", orderId: "ORD-2" }),
      row({ id: "a2", orderId: "ORD-1" }),
    ])

    expect(groups.map((g) => g.key)).toEqual(["ORD-1", "ORD-2"])
    expect(groups[0].count).toBe(2)
    expect(groups[1].count).toBe(1)
  })

  it("never groups money events, which have no order", () => {
    // Two `cash.submitted` rows are two genuinely different facts. Collapsing
    // them by event would hide both behind a single row and one timestamp.
    const groups = groupNotifications([
      row({
        id: "m1",
        orderId: null,
        event: "cash.submitted",
        title: "Cash submitted",
      }),
      row({
        id: "m2",
        orderId: null,
        event: "cash.submitted",
        title: "Cash submitted",
      }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.key)).toEqual(["m1", "m2"])
    expect(groups.every((g) => g.count === 1)).toBe(true)
  })

  it("keys an ungrouped money event by its row id, so React keys stay unique", () => {
    // A money event and an order could otherwise collide if both keyed on a
    // nullish orderId.
    const groups = groupNotifications([
      row({ id: "m1", orderId: null, event: "payout.approved" }),
      row({ id: "o1", orderId: "ORD-1" }),
    ])

    const keys = groups.map((g) => g.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("preserves input order across mixed order and money events", () => {
    // Money events are pushed inline, not collected at the end, so the list
    // stays in the order the reader's activity actually happened.
    const groups = groupNotifications([
      row({ id: "a", orderId: "ORD-1" }),
      row({ id: "m", orderId: null, event: "payout.approved" }),
      row({ id: "b", orderId: "ORD-2" }),
      row({ id: "a2", orderId: "ORD-1" }),
    ])

    expect(groups.map((g) => g.key)).toEqual(["ORD-1", "m", "ORD-2"])
  })

  it("returns nothing for an empty inbox", () => {
    expect(groupNotifications([])).toEqual([])
  })
})
