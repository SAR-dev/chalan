// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { NotificationEventIcon } from "@/features/notifications/components/notification-event-icon"

import { ORDER_EVENTS } from "@/lib/order-events"

function renderIcon(event: string) {
  return render(<NotificationEventIcon event={event} />).container
}

describe("NotificationEventIcon", () => {
  it("gives every known event an icon", () => {
    // Exhaustive by construction (`Record<OrderEvent, …>`), but the failure mode
    // is silent — a missing entry would render the neutral fallback and look like
    // a styling choice rather than a gap.
    for (const event of ORDER_EVENTS) {
      const el = renderIcon(event)
      expect(
        el.querySelector("[data-testid='notification-status-icon']"),
        `${event} has no icon`,
      ).not.toBeNull()
      expect(
        el.querySelector("[data-testid='notification-status-icon-unknown']"),
        `${event} fell back to the neutral dot`,
      ).toBeNull()
    }
  })

  it("tags the icon with its event, so a row's status is inspectable", () => {
    expect(
      renderIcon("order.delivered").querySelector(
        "[data-testid='notification-status-icon']",
      ),
    ).toHaveAttribute("data-event", "order.delivered")
  })

  it("reuses the badge tone palette, including the dark-mode half", () => {
    // A delivered notification must be the same green a Delivered order badge
    // is. The border classes are dropped (a circle has no border) but the
    // `dark:` overrides are not — dropping those would leave green-600 text on
    // a dark background.
    const el = renderIcon("order.delivered")
    const cls = el.querySelector("svg")?.parentElement?.className ?? ""
    expect(cls).toContain("text-green-600")
    expect(cls).toContain("dark:text-green-400")
    expect(cls).not.toContain("border")
  })

  it("gives a delivered parcel a check and a failed one a cross", () => {
    // lucide stamps `lucide-<name>` on the svg, which is the glyph identity.
    const glyph = (event: string) =>
      renderIcon(event).querySelector("svg")?.getAttribute("class") ?? ""

    expect(glyph("order.delivered")).toContain("lucide-package-check")
    expect(glyph("order.failed")).toContain("lucide-circle-x")
    expect(glyph("order.cancelled")).toContain("lucide-ban")
    expect(glyph("cash.submitted")).toContain("lucide-banknote")
  })

  it("does not reuse one glyph for two events", () => {
    // Colour alone cannot carry the whole status; two events sharing a glyph
    // would be distinguishable only by hue, which fails for anyone who cannot
    // separate the tones.
    const glyph = (event: string) =>
      renderIcon(event).querySelector("svg")?.getAttribute("class") ?? ""
    const seen = new Map<string, string>()
    for (const event of ORDER_EVENTS) {
      const name = glyph(event)
      const clash = seen.get(name)
      expect(clash, `${event} and ${clash} share a glyph`).toBeUndefined()
      seen.set(name, event)
    }
  })

  it("falls back to a neutral dot for an event it does not know", () => {
    // The column is plain text, so a row can name an event this deploy has
    // never heard of. A neutral icon reads as "no status"; a missing icon reads
    // as a rendering bug.
    const el = renderIcon("order.teleported")
    expect(
      el.querySelector("[data-testid='notification-status-icon-unknown']"),
    ).not.toBeNull()
    expect(
      el.querySelector("[data-testid='notification-status-icon']"),
    ).toBeNull()
  })

  it("treats the glyph as decorative, since the title beside it carries the meaning", () => {
    // An aria-labelled icon would make a screen reader announce the event twice,
    // once for the icon and once for the title text next to it.
    expect(
      renderIcon("order.delivered").querySelector("[aria-hidden]"),
    ).not.toBeNull()
  })
})
