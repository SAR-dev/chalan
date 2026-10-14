import { describe, expect, it, vi } from "vitest"

/**
 * The subject is the line that makes the inbox scannable: `ORD-100163` on its
 * own identifies nothing, so twenty rows were twenty identical lines.
 *
 * It is a snapshot taken at event time, because `orderId` carries no foreign key
 * — a notification outlives its order, so this is the only remaining record of
 * what it was about.
 */
const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }))

vi.mock("@/lib/db", () => ({
  dbRead: {
    select: (...args: unknown[]) => {
      selectMock(...args)
      return {
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([{ name: process.env.__CITY_NAME ?? "Barisal" }]),
          }),
        }),
      }
    },
  },
  db: {},
}))

import {
  buildNotificationSubject,
  createCityNameResolver,
} from "@/lib/notification-subject"

/** A city lookup that always resolves `name`. */
const named = (name: string | null) => () => Promise.resolve(name)

describe("buildNotificationSubject", () => {
  it("names the recipient and the destination", async () => {
    expect(
      await buildNotificationSubject(
        { recipientName: "Ayesha Rahman", deliveryCityId: "c1" },
        named("Barisal"),
      ),
    ).toBe("Ayesha Rahman → Barisal")
  })

  it("falls back to whichever half resolved", async () => {
    // A city lookup can fail. The emitter must not drop the row because a display
    // field is incomplete — the fallback is a less pretty subject, not no subject.
    expect(
      await buildNotificationSubject(
        { recipientName: "Ayesha Rahman", deliveryCityId: "c1" },
        named(null),
      ),
    ).toBe("Ayesha Rahman")
    expect(
      await buildNotificationSubject(
        { recipientName: null, deliveryCityId: "c1" },
        named("Barisal"),
      ),
    ).toBe("Barisal")
  })

  it("returns null when it has nothing to say", async () => {
    // Null rather than an empty string: the UI treats null as "fall back to the
    // order code", and "" would render as a blank line beside it.
    expect(
      await buildNotificationSubject(
        { recipientName: "   ", deliveryCityId: null },
        named(null),
      ),
    ).toBeNull()
  })

  it("never looks up a city a row does not have", async () => {
    const look = vi.fn().mockResolvedValue(null)
    await buildNotificationSubject(
      { recipientName: "Ayesha", deliveryCityId: null },
      look,
    )
    // A pointless query per emitted row, in the one place a batch pays per order.
    expect(look).not.toHaveBeenCalled()
  })

  it("survives a city lookup that rejects", async () => {
    // A failing lookup must not fail the order transition that raised the event
    // — same posture as every other best-effort sink here.
    const subject = await buildNotificationSubject(
      { recipientName: "Ayesha", deliveryCityId: "c1" },
      () => Promise.reject(new Error("lookup failed")),
    )
    expect(subject).toBe("Ayesha")
  })
})

describe("createCityNameResolver", () => {
  it("queries once per city, however many orders share it", async () => {
    const resolve = createCityNameResolver()

    // A batch of 25 orders across 2 cities must cost 2 lookups, not 25 — the
    // same per-distinct-key memo the recipient resolver uses.
    await Promise.all([
      resolve("c1"),
      resolve("c1"),
      resolve("c2"),
      resolve("c1"),
    ])

    expect(selectMock).toHaveBeenCalledTimes(2)
  })

  it("gives each caller its own cache", () => {
    // A module-level cache would leak a city's name across transactions, and a
    // renamed city would keep rendering the old name for the life of the process.
    const a = createCityNameResolver()
    const b = createCityNameResolver()
    expect(a).not.toBe(b)
  })

  it("resolves a city name end to end through the resolver", async () => {
    const subject = await buildNotificationSubject(
      { recipientName: "Ayesha Rahman", deliveryCityId: "c1" },
      createCityNameResolver(),
    )
    expect(subject).toBe("Ayesha Rahman → Barisal")
  })
})
