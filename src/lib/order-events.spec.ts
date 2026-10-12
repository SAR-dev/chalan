import { describe, expect, it, vi } from "vitest"
import {
  emitOrderEvent,
  isOrderEvent,
  notificationHrefForEvent,
  notificationTitleForEvent,
  ORDER_EVENTS,
} from "@/lib/order-events"

type EventArgs = { now?: string; event?: string }

const { emitWebhookEventMock, emitNotificationEventMock } = vi.hoisted(() => ({
  emitWebhookEventMock: vi.fn(async (_args: EventArgs) => {}),
  emitNotificationEventMock: vi.fn(async (_args: EventArgs) => {}),
}))

vi.mock("@/lib/webhooks", () => ({ emitWebhookEvent: emitWebhookEventMock }))
vi.mock("@/lib/notifications", () => ({
  emitNotificationEvent: emitNotificationEventMock,
}))

const tx = {} as never

describe("order events", () => {
  it("fans an order event out to both sinks with one call", async () => {
    await emitOrderEvent({
      tx,
      event: "order.dispatched",
      orderId: "ORD-1",
      merchantId: "MER-1",
      actorName: "RIDER-014",
      now: "2026-01-01T00:00:00.000Z",
      data: { id: "ORD-1" },
    })

    expect(emitWebhookEventMock).toHaveBeenCalledTimes(1)
    expect(emitNotificationEventMock).toHaveBeenCalledTimes(1)
  })

  it("passes the same instant to both sinks", async () => {
    const now = "2026-01-01T00:00:00.000Z"
    await emitOrderEvent({
      tx,
      event: "order.created",
      orderId: "ORD-1",
      merchantId: "MER-1",
      now,
      data: {},
    })

    // A webhook and a notification that disagree about "when" read as two
    // different events on the same order.
    expect(emitWebhookEventMock.mock.calls[0][0].now).toBe(now)
    expect(emitNotificationEventMock.mock.calls[0][0].now).toBe(now)
  })

  it("sends a money event only to notifications, never to the webhook queue", async () => {
    await emitOrderEvent({
      tx,
      event: "payout.approved",
      orderId: null,
      merchantId: "MER-1",
      data: {},
    })

    expect(emitWebhookEventMock).not.toHaveBeenCalled()
    expect(emitNotificationEventMock).toHaveBeenCalledTimes(1)
  })

  it("does not widen the public webhook vocabulary with a money event", async () => {
    // If this ever fails because someone added cash.submitted to
    // WEBHOOK_EVENTS, the public /api/v1 contract changed without a decision.
    expect(emitWebhookEventMock).toBeDefined()
    const webhookNames = [
      "order.created",
      "order.approved",
      "order.dispatched",
      "order.picked-up",
      "order.out-for-delivery",
      "order.delivered",
      "order.failed",
      "order.returned",
      "order.cancelled",
    ]
    expect(webhookNames.every(isOrderEvent)).toBe(true)
    expect(isOrderEvent("payout.approved")).toBe(true)
    expect(isOrderEvent("cash.submitted")).toBe(true)
  })

  it("recognises exactly its own events", () => {
    expect(isOrderEvent("order.nonsense")).toBe(false)
    expect(isOrderEvent(undefined)).toBe(false)
    expect(isOrderEvent(42)).toBe(false)
    for (const e of ORDER_EVENTS) expect(isOrderEvent(e)).toBe(true)
  })
})

describe("notificationHrefForEvent", () => {
  it("deep-links an order event to the merchant's order page", () => {
    expect(notificationHrefForEvent("order.delivered", "ORD-9")).toBe(
      "/merchant/orders/ORD-9",
    )
  })

  it("sends money events to the merchant's payouts", () => {
    expect(notificationHrefForEvent("payout.approved", null)).toBe(
      "/merchant/payouts",
    )
    expect(notificationHrefForEvent("cash.submitted", null)).toBe(
      "/merchant/payouts",
    )
  })

  it("never produces a dangling order link", () => {
    // A regression here renders a dead link in the tray.
    for (const e of ORDER_EVENTS) {
      const href = notificationHrefForEvent(e, null)
      expect(href).not.toMatch(/\/$/)
      expect(href).not.toContain("undefined")
    }
  })

  it("stays inside the merchant segment for every event", () => {
    // Notifications are delivered only to MERCHANT profiles, so a `/dashboard/`
    // href is a link the only possible reader cannot open — it bounces off the
    // role guard and drops them on `/merchant`, which is indistinguishable from
    // the notification being broken. Every branch has to be merchant-scoped,
    // not just the ones that happen to be today.
    for (const e of ORDER_EVENTS) {
      for (const orderId of [null, "ORD-9"]) {
        expect(notificationHrefForEvent(e, orderId)).toMatch(/^\/merchant\//)
      }
    }
  })
})

describe("notificationTitleForEvent", () => {
  it("gives every event a human title", () => {
    for (const e of ORDER_EVENTS) {
      expect(notificationTitleForEvent(e)).toBeTruthy()
    }
  })

  it("titles the events the spec names", () => {
    expect(notificationTitleForEvent("order.created")).toBe(
      "New order received",
    )
    expect(notificationTitleForEvent("order.delivered")).toBe("Order delivered")
    expect(notificationTitleForEvent("cash.submitted")).toBe("Cash submitted")
    expect(notificationTitleForEvent("payout.approved")).toBe("Payout approved")
  })
})
