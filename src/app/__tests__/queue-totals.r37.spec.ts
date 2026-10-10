// Server-page tests for the three admin queues that used to run two full
// aggregates over the same table: an unpredicated `count(*)` for the pagination
// total, plus a `GROUP BY status` for the tab badges. The total is the sum of
// the groups, so the second scan is pure waste — and unlike a cached total, a
// derived one stays exact, which is what a pagination footer needs.
//
// The clients are stubbed — these assert on the queries issued and the props
// derived, not on rendered output.

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api-auth", () => ({
  requireSession: async () => ({ role: "SUPER_ADMIN", name: "Admin Amy" }),
}))
vi.mock("@/lib/login-redirect", () => ({
  loginRedirectPath: async () => "/login",
}))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
}))

vi.mock("@/app/dashboard/merchants/merchants-client", () => ({
  MerchantsPageClient: (p: unknown) => p,
}))
vi.mock("@/app/dashboard/payouts/payouts-client", () => ({
  PayoutsPageClient: (p: unknown) => p,
}))
vi.mock("@/app/dashboard/rider-applications/rider-applications-client", () => ({
  RiderApplicationsPageClient: (p: unknown) => p,
}))

/**
 * What the `GROUP BY status` query returns.
 */
let groups: unknown[] = []
/** Queries that grouped — the per-status counts, one per page. */
let groupByCalls = 0
/** Queries that neither grouped nor limited — i.e. a bare `count(*)`. */
let bareCountCalls = 0

/**
 * Rows the ungrouped, unpaginated queries return. `[]` is the right answer for
 * the row scans these pages issue; they are never asserted on.
 */
let listRows: unknown[] = []

/**
 * The total a bare `count(*)` reports. Deliberately unmatchable so that
 * reintroducing the extra query shows up as a wrong number in a failure diff
 * rather than as a crash on `undefined` — the diff is what tells a reader which
 * regression they are looking at.
 */
const BARE_COUNT_TOTAL = 999_999

/**
 * Queries are classified by the shape of the builder rather than by the order
 * they are started, because a page that runs three queries instead of two shifts
 * every positional slot and turns a clean assertion into a confusing crash.
 *
 * - `groupBy` → the status counts
 * - `limit`   → the row scan
 * - neither   → a bare aggregate, which is the thing under test
 */
vi.mock("@/lib/db", () => {
  const db = {
    select: () => {
      const shape = { grouped: false, limited: false }
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        leftJoin: () => chain,
        orderBy: () => chain,
        limit: () => {
          shape.limited = true
          return chain
        },
        groupBy: () => {
          shape.grouped = true
          return chain
        },
        then: (onFulfilled: (v: unknown) => unknown) => {
          if (shape.grouped) {
            groupByCalls += 1
            return Promise.resolve(groups).then(onFulfilled)
          }
          if (!shape.limited) {
            bareCountCalls += 1
            return Promise.resolve([{ total: BARE_COUNT_TOTAL }]).then(
              onFulfilled,
            )
          }
          return Promise.resolve(listRows).then(onFulfilled)
        },
      }
      return chain
    },
  }
  return { db, dbRead: db, pool: {} }
})

async function renderPage(pagePath: string, groupRows: unknown[]) {
  vi.resetModules()
  groups = groupRows
  listRows = []
  groupByCalls = 0
  bareCountCalls = 0
  const Page = (await import(pagePath)).default
  const element = (await Page()) as { props: Record<string, unknown> }
  return { props: element.props, groupByCalls, bareCountCalls }
}

const MERCHANT_GROUPS = [
  { status: "PENDING", count: 4 },
  { status: "ACTIVE", count: 11 },
  { status: "SUSPENDED", count: 2 },
]

describe("Merchant queue - total derived from the status groups", () => {
  const PAGE = "@/app/dashboard/merchants/page"

  it("sums the groups instead of counting the table again", async () => {
    const { props } = await renderPage(PAGE, MERCHANT_GROUPS)

    // 4 + 11 + 2. From a separate `count(*)` this would be
    // `BARE_COUNT_TOTAL` instead, which is the point.
    expect(props.initialTotal).toBe(17)
    expect(props.initialCounts).toEqual({
      total: 17,
      active: 11,
      suspended: 2,
    })
  })

  it("runs no bare aggregate at all", async () => {
    const { bareCountCalls } = await renderPage(PAGE, MERCHANT_GROUPS)

    // The removed scan: `GROUP BY status` already visits every row, so a
    // second full pass over `merchant` on every render bought nothing.
    expect(bareCountCalls).toBe(0)
  })

  it("still groups exactly once", async () => {
    const { groupByCalls } = await renderPage(PAGE, MERCHANT_GROUPS)
    expect(groupByCalls).toBe(1)
  })

  it("reports zero for an empty table instead of NaN", async () => {
    const { props } = await renderPage(PAGE, [])

    // A `reduce` with no initial value throws on an empty array; with one it
    // must be 0, because a NaN total renders as a blank page count.
    expect(props.initialTotal).toBe(0)
    expect(props.initialCounts).toEqual({ total: 0, active: 0, suspended: 0 })
  })
})

describe("Payout queue - total derived from the status groups", () => {
  it("sums the groups and runs no bare count", async () => {
    const { props, groupByCalls, bareCountCalls } = await renderPage(
      "@/app/dashboard/payouts/page",
      [
        { status: "PENDING", count: 3 },
        { status: "PAID", count: 8 },
      ],
    )

    expect(props.initialTotal).toBe(11)
    expect(groupByCalls).toBe(1)
    expect(bareCountCalls).toBe(0)
  })
})

describe("Rider application queue - total derived", () => {
  it("sums the groups and runs no bare count", async () => {
    const { props, groupByCalls, bareCountCalls } = await renderPage(
      "@/app/dashboard/rider-applications/page",
      [
        { status: "PENDING", count: 6 },
        { status: "APPROVED", count: 14 },
      ],
    )

    expect(props.initialTotal).toBe(20)
    expect(groupByCalls).toBe(1)
    expect(bareCountCalls).toBe(0)
  })
})
