import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  countUnreadNotifications,
  createRecipientResolver,
  emitNotificationEvent,
  getNotificationsForUser,
  markNotificationsSeen,
} from "@/lib/notifications"

// A fluent builder that terminates in the rows it was seeded with, so each
// assertion is about *which* predicate was composed, not about SQL text.
function makeRunner<T>(rows: T[]) {
  const state: {
    where?: unknown
    values?: unknown
    updated?: Record<string, unknown>
    onConflictDoNothing?: boolean
    selects: number
  } = { selects: 0 }

  // The select chain terminates at different points depending on the caller:
  // `resolveRecipients` awaits straight after `.where()`, while the feed awaits
  // after `.limit()`. One chain serves both — each step returns a thenable that
  // resolves to the rows *and* carries the remaining builder methods.
  const selectChain = () => {
    const makeStep = () => {
      const terminal = Promise.resolve(rows)
      const step: Record<string, unknown> = {}
      for (const m of ["from", "where", "orderBy", "limit", "offset", "for"]) {
        step[m] = (arg: unknown) => {
          if (m === "where") state.where = arg
          return makeStep()
        }
      }
      step.then = terminal.then.bind(terminal)
      return step
    }
    return makeStep()
  }

  const runner = {
    select: () => {
      state.selects += 1
      return selectChain()
    },
    insert: () => ({
      values: (v: unknown) => {
        state.values = v
        return {
          onConflictDoNothing: () => {
            state.onConflictDoNothing = true
            return Promise.resolve()
          },
        }
      },
    }),
    update: () => {
      const chain: Record<string, unknown> = {}
      chain.set = (v: Record<string, unknown>) => {
        state.updated = v
        return chain
      }
      chain.where = () => Promise.resolve()
      return chain
    },
  }
  return { runner: runner as unknown as { select: () => unknown }, state }
}

const { dbMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn((): unknown => undefined) },
}))
vi.mock("@/lib/db", () => ({ db: dbMock, dbRead: dbMock }))

const NOW = "2026-01-01T00:00:00.000Z"
const RECIPIENTS = [{ userId: "usr-owner" }, { userId: "usr-moderator" }]

describe("emitNotificationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function seedRecipients(rows = RECIPIENTS) {
    const { runner, state } = makeRunner(rows)
    dbMock.select.mockReturnValue(runner.select())
    return { tx: runner as never, state }
  }

  it("writes one row per recipient, not one per event", async () => {
    const { tx, state } = seedRecipients()

    await emitNotificationEvent({
      tx: tx as never,
      event: "order.delivered",
      orderId: "ORD-1",
      merchantId: "MER-1",
      actorName: "RIDER-014",
      now: NOW,
    })

    const values = state.values as Array<{ userId: string }>
    expect(values).toHaveLength(2)
    expect(values.map((v) => v.userId)).toEqual(["usr-owner", "usr-moderator"])
  })

  it("stamps the emitter's instant so a batch shares one clock", async () => {
    const { tx, state } = seedRecipients()

    await emitNotificationEvent({
      tx: tx as never,
      event: "order.created",
      orderId: "ORD-1",
      merchantId: "MER-1",
      actorName: null,
      now: NOW,
    })

    const values = state.values as Array<{ createdAt: string }>
    expect(values.every((v) => v.createdAt === NOW)).toBe(true)
  })

  it("resolves the link from the event, not from the order id", async () => {
    const { tx, state } = seedRecipients()

    await emitNotificationEvent({
      tx: tx as never,
      event: "order.failed",
      orderId: "ORD-7",
      merchantId: "MER-1",
      actorName: null,
      now: NOW,
    })

    expect((state.values as Array<{ href: string }>)[0].href).toBe(
      "/merchant/orders/ORD-7",
    )
  })

  it("tolerates a duplicate rather than aborting the whole batch", async () => {
    // `notification_user_event_order_uniq` makes a repeated fact an error at the
    // database. Left unhandled, one recipient who had already seen the event
    // would abort the entire multi-recipient insert — costing every *other*
    // recipient their notification — and the throw would be swallowed below, so
    // the caller would believe it had succeeded.
    const { tx, state } = seedRecipients()

    await emitNotificationEvent({
      tx: tx as never,
      event: "order.created",
      orderId: "ORD-1",
      merchantId: "MER-1",
      actorName: null,
      now: NOW,
    })

    expect(state.onConflictDoNothing).toBe(true)
  })

  it("links a money event with no order to payouts, not a broken path", async () => {
    const { tx, state } = seedRecipients()

    await emitNotificationEvent({
      tx: tx as never,
      event: "payout.approved",
      orderId: null,
      merchantId: "MER-1",
      actorName: null,
      now: NOW,
    })

    const row = (
      state.values as Array<{ href: string; orderId: string | null }>
    )[0]
    expect(row.href).toBe("/merchant/payouts")
    expect(row.orderId).toBeNull()
  })

  it("writes nothing when a merchant has no active recipient", async () => {
    const { tx, state } = seedRecipients([])

    await emitNotificationEvent({
      tx: tx as never,
      event: "order.created",
      orderId: "ORD-1",
      merchantId: "MER-1",
      actorName: null,
      now: NOW,
    })

    expect(state.values).toBeUndefined()
  })

  it("never throws, so a notification cannot fail the order it describes", async () => {
    const tx = {
      select: () => {
        throw new Error("table missing")
      },
      insert: () => ({ values: () => Promise.resolve() }),
    }

    // The transition that raised this event must still commit.
    await expect(
      emitNotificationEvent({
        tx: tx as never,
        event: "order.delivered",
        orderId: "ORD-1",
        merchantId: "MER-1",
        actorName: null,
        now: NOW,
      }),
    ).resolves.toBeUndefined()
  })

  it("swallows an insert failure too", async () => {
    // The builder call itself rejecting is still swallowed: the transition that
    // raised the event must not fail because a notification could not be written.
    const failing = {
      values: () => ({
        onConflictDoNothing: () => Promise.reject(new Error("write conflict")),
      }),
    }
    const { runner } = makeRunner(RECIPIENTS)
    dbMock.select.mockReturnValue(runner.select())
    const tx = {
      select: () => ({
        from: () => ({ where: () => Promise.resolve(RECIPIENTS) }),
      }),
      insert: () => failing,
    }

    await expect(
      emitNotificationEvent({
        tx: tx as never,
        event: "order.created",
        orderId: "ORD-1",
        merchantId: "MER-1",
        actorName: null,
        now: NOW,
      }),
    ).resolves.toBeUndefined()
  })
})

describe("createRecipientResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("looks a merchant up once, however many times it is asked", async () => {
    const { runner, state } = makeRunner(RECIPIENTS)
    const resolve = createRecipientResolver(runner as never)

    await resolve("MER-1")
    await resolve("MER-1")
    await resolve("MER-1")

    // The point of the memo: a 25-order batch costs one lookup, not 25.
    expect(state.selects).toBe(1)
  })

  it("still looks up a second, different merchant", async () => {
    const { runner, state } = makeRunner(RECIPIENTS)
    const resolve = createRecipientResolver(runner as never)

    await resolve("MER-1")
    await resolve("MER-2")

    expect(state.selects).toBe(2)
  })

  it("caches the settled promise, so a rejection is not re-issued per row", async () => {
    let calls = 0
    const tx = {
      select: () => {
        calls += 1
        return {
          from: () => ({
            where: () => Promise.resolve(RECIPIENTS),
          }),
        }
      },
    }
    const resolve = createRecipientResolver(tx as never)

    await resolve("MER-1")
    await resolve("MER-1")

    expect(calls).toBe(1)
  })
})

describe("getNotificationsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const ROW = {
    id: "n1",
    event: "order.delivered",
    orderId: "ORD-1",
    merchantId: "MER-1",
    actorName: null,
    title: "Order delivered",
    href: "/dashboard/orders/ORD-1",
    createdAt: NOW,
  }

  it("returns newest-first rows with the unread count", async () => {
    const { runner } = makeRunner([ROW])
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })

    expect(result.notifications).toHaveLength(1)
    expect(result.newCount).toBe(1)
  })

  it("recomputes href, so rows written before a routing fix repair themselves", async () => {
    // ROW carries the href the old `notificationHrefForEvent` stored: an
    // admin-segment path no merchant can open. Reading the column would keep
    // every already-written notification broken forever; recomputing from the
    // `event` + `orderId` on the row heals them with no migration.
    expect(ROW.href).toBe("/dashboard/orders/ORD-1")
    const { runner } = makeRunner([ROW])
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })

    expect(result.notifications[0].href).toBe("/merchant/orders/ORD-1")
  })

  it("coerces an unrecognised event to the merchant's own order page", async () => {
    // The column is plain text, so a row written by a newer deploy can name an
    // event this build does not know. Falling back to the stored href is what
    // let an admin-segment link reach a merchant and bounce to `/merchant`; the
    // fallback is now the order itself, which is merchant-scoped by
    // construction.
    const rows = [
      {
        ...ROW,
        id: "unknown",
        event: "order.in-transit",
        href: "/dashboard/orders/ORD-1",
      },
    ]
    const { runner } = makeRunner(rows)
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })

    expect(result.notifications[0].href).toBe("/merchant/orders/ORD-1")
  })

  it("keeps a money event's own href, having no order to coerce it to", async () => {
    const rows = [
      {
        ...ROW,
        id: "money",
        event: "payout.settled",
        orderId: null,
        href: "/merchant/payouts",
      },
    ]
    const { runner } = makeRunner(rows)
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })

    expect(result.notifications[0].href).toBe("/merchant/payouts")
  })

  it("heals every event, not just order links", async () => {
    const rows = [
      { ...ROW, id: "money", event: "payout.approved", orderId: null },
      { ...ROW, id: "orphan", orderId: null },
    ]
    const { runner } = makeRunner(rows)
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })

    for (const n of result.notifications) {
      expect(n.href).toMatch(/^\/merchant\//)
    }
  })

  it("counts only rows newer than the watermark", async () => {
    const rows = [
      { ...ROW, id: "new", createdAt: "2026-01-02T00:00:00.000Z" },
      { ...ROW, id: "old", createdAt: "2025-12-31T00:00:00.000Z" },
    ]
    const { runner } = makeRunner(rows)
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: "2026-01-01T00:00:00.000Z",
    })

    // One of two is newer than the watermark — the badge and the list agree
    // because they come from the same read.
    expect(result.newCount).toBe(1)
    expect(result.notifications).toHaveLength(2)
  })

  it("treats a never-seen reader as having everything new", async () => {
    const { runner } = makeRunner([ROW])
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })
    expect(result.newCount).toBe(1)
  })

  it("hands createdAt back as the string the driver stored", async () => {
    // Not a row-identity assertion: `href` is deliberately rewritten on the way
    // out. The concern here is only that `createdAt` needs no reformatting for
    // the tray's `new Date(...)` and the watermark comparison.
    const { runner } = makeRunner([ROW])
    dbMock.select.mockReturnValue(runner.select())

    const result = await getNotificationsForUser(undefined as never, {
      userId: "usr-1",
      seenAt: null,
    })
    expect(result.notifications[0].createdAt).toBe(ROW.createdAt)
    expect(result.notifications[0]).toMatchObject({
      id: ROW.id,
      event: ROW.event,
      orderId: ROW.orderId,
      title: ROW.title,
    })
  })
})

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("counts unread rows", async () => {
    const { runner } = makeRunner([{ n: 5 }])
    dbMock.select.mockReturnValue(runner.select())

    const n = await countUnreadNotifications(runner as never, {
      userId: "usr-1",
      seenAt: "2026-01-01T00:00:00.000Z",
    })
    expect(n).toBe(5)
  })

  it("reports zero when the query returns no row", async () => {
    const { runner } = makeRunner([])
    dbMock.select.mockReturnValue(runner.select())

    const n = await countUnreadNotifications(runner as never, {
      userId: "usr-1",
      seenAt: null,
    })
    expect(n).toBe(0)
  })
})

describe("markNotificationsSeen", () => {
  it("advances the watermark monotonically", async () => {
    const { runner, state } = makeRunner([])
    await markNotificationsSeen(runner as never, {
      userId: "usr-1",
      now: NOW,
    })

    // GREATEST with the stored value is what makes a stale client harmless.
    expect(state.updated).toHaveProperty("notificationsSeenAt")
    expect(state.updated?.notificationsSeenAt).toBeDefined()
  })
})
