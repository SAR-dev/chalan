import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The notification retention sweep.
 *
 * The assertion that matters is not the count but *which rows are eligible*. The
 * inbox shows one row per order, so pruning by age alone is a correctness bug: an
 * order dispatched 40 days ago and delivered 5 days ago keeps its delivered row
 * and loses its dispatched one, and the group silently reverts to reporting
 * "dispatched". A row is only eligible once no sibling for that order is still
 * inside the window.
 *
 * These tests inspect the composed predicate rather than rows, because the
 * behaviour lives entirely in the `WHERE` — a fake table would need a real
 * Postgres to tell us anything the SQL does not already say.
 */

interface DeleteCall {
  where: unknown
  rows: { id: string }[]
}

const { deletes } = vi.hoisted(() => ({ deletes: [] as unknown[] }))

vi.mock("@/lib/db", () => ({
  db: {
    delete: () => {
      const call: Record<string, unknown> = {}
      const chain = {
        where: (w: unknown) => {
          call.where = w
          return chain
        },
        returning: (): Promise<{ id: string }[]> => {
          call.rows = []
          return Promise.resolve([])
        },
      }
      deletes.push(call)
      return chain
    },
  },
  dbRead: { select: () => ({ from: () => [] }) },
}))

vi.mock("@/lib/storage", () => ({
  listFiles: vi.fn(async () => []),
  deleteFile: vi.fn(async () => undefined),
}))

import { runCleanupNotifications } from "@/lib/maintenance"

/**
 * Render the composed predicate back to SQL.
 *
 * Via Drizzle's own dialect rather than by walking the returned object by hand:
 * the internal shape of a `SQL` chunk is an implementation detail that has
 * changed before, and a hand-rolled visitor quietly reads an empty string when it
 * does — which looks exactly like a passing assertion on `toContain("exists")`
 * failing for the wrong reason.
 */
const dialect = new PgDialect()
function sqlText(where: unknown): string {
  return dialect.sqlToQuery(where as SQL).sql
}

beforeEach(() => {
  deletes.length = 0
  delete process.env.NOTIFICATION_RETENTION_DAYS
})

describe("runCleanupNotifications", () => {
  it("sweeps order events and money events as two separate deletes", async () => {
    await runCleanupNotifications()
    // Two predicates, because they differ: order rows are group-guarded, money
    // rows have no order to guard and go on age alone.
    expect(deletes).toHaveLength(2)
  })

  it("keeps an order whole while any of its notifications is still in the window", async () => {
    await runCleanupNotifications()

    const orderPredicate = sqlText((deletes[0] as { where: unknown }).where)

    // The NOT EXISTS sibling check is the whole point: an order is swept only
    // once it has gone quiet entirely.
    expect(orderPredicate).toContain("not exists")
    expect(orderPredicate).toContain("createdAt")
  })

  it("excludes order-less rows from the order sweep", async () => {
    await runCleanupNotifications()

    const orderPredicate = sqlText((deletes[0] as { where: unknown }).where)
    const moneyPredicate = sqlText((deletes[1] as { where: unknown }).where)

    expect(orderPredicate).toContain('"orderId" is not null')
    expect(moneyPredicate).toContain('"orderId" is null')
    // Money rows must not carry the sibling guard — it would make one recent
    // payout keep every historical cash submission alive forever.
    expect(moneyPredicate).not.toContain("exists")
  })

  it("reports how many of each it deleted", async () => {
    const result = await runCleanupNotifications()
    expect(result).toMatchObject({
      deletedOrderEvents: 0,
      deletedMoneyEvents: 0,
    })
    expect(result.retentionDays).toBeGreaterThan(0)
  })

  it("honours NOTIFICATION_RETENTION_DAYS over the default", async () => {
    process.env.NOTIFICATION_RETENTION_DAYS = "3"
    const result = await runCleanupNotifications()
    expect(result.retentionDays).toBe(3)
  })
})
