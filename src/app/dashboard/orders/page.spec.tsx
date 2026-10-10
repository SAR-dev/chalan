// Server-page test for the orders dashboard. Not a component test: the page
// returns an element and this asserts on the queries it issues and on the cache
// wrapper around them, so nothing is rendered.

import { describe, expect, it, vi } from "vitest"

/**
 * `unstable_cache` arguments as this module was loaded, so the spec can assert
 * on the key and the TTL rather than just observing that a cache exists.
 */
const cacheCalls: {
  keys: string[]
  options: { revalidate?: number; tags?: string[] }
}[] = []

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keys: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => {
    cacheCalls.push({ keys, options })
    return fn
  },
}))

const session = { role: "SUPER_ADMIN", name: "Admin Amy" }
vi.mock("@/lib/api-auth", () => ({ requireSession: async () => session }))
vi.mock("@/lib/login-redirect", () => ({
  loginRedirectPath: async () => "/login",
}))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))

/** Rows the "recent orders" scan should return. */
let rows: unknown[] = []
/** The single aggregate row. */
let counts: unknown[] = []
/** Every `from(...)` target the page built, in order. */
const fromCalls: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = (kind: "rows" | "aggregate") => {
    const chain: Record<string, unknown> = {
      from: (table: unknown) => {
        fromCalls.push(table)
        return chain
      },
      orderBy: () => chain,
      limit: () => chain,
      groupBy: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(
          kind === "rows"
            ? rows
            : [
                counts.shift() ?? {
                  total: 0,
                  pending: 0,
                  approved: 0,
                  inProgress: 0,
                },
              ],
        ).then(onFulfilled),
    }
    return chain
  }
  const db = {
    // `select()` with no projection is the row scan; with a projection it is
    // the aggregate. This keeps the fixture independent of query ordering.
    select: (projection?: unknown) =>
      makeSelectChain(projection ? "aggregate" : "rows"),
  }
  return { db, dbRead: db, pool: {} }
})

/**
 * Render the page and return the props it handed to `OrdersPageClient`.
 *
 * Reading `element.props` rather than rendering it: creating the element does
 * not invoke the component, so the props are the only thing observable without
 * standing up the whole data table.
 */
async function renderPage() {
  vi.resetModules()
  cacheCalls.length = 0
  const Page = (await import("./page")).default
  const element = (await Page()) as { props: Record<string, unknown> }
  return element.props
}

const AGG = {
  total: 42,
  pending: 7,
  approved: 12,
  inProgress: 20,
}

describe("Dashboard orders page - aggregate pass and cache", () => {
  it("walks `order` once for counts, not twice", async () => {
    fromCalls.length = 0
    counts = [{ ...AGG }]
    rows = [{ id: "order_1" }]

    await renderPage()

    // Two reads total: the recent-orders scan (LIMIT 20, an index walk) and
    // one aggregate. The unpredicated `count(*)` + `GROUP BY status` pair this
    // replaced was three.
    expect(fromCalls).toHaveLength(2)
  })

  it("derives every counter from that single aggregate row", async () => {
    counts = [{ ...AGG }]
    rows = []

    const props = await renderPage()

    expect(props.initialCounts).toEqual(AGG)
    expect(props.initialTotal).toBe(AGG.total)
  })

  it("caches the aggregate behind a tag and a 30-60s TTL", async () => {
    cacheCalls.length = 0
    counts = [{ ...AGG }]
    rows = []

    await renderPage()

    expect(cacheCalls).toHaveLength(1)
    const [{ keys, options }] = cacheCalls
    expect(keys).toContain("dashboard-order-counts")
    // Namespaced via `statTag` so it cannot collide with an unrelated cache, and
    // expired by `applyOrderTransition`/`applyBulkOrderTransition` — a tag
    // nothing refreshes would leave this tile frozen until the TTL.
    expect(options.tags).toContain("stat:order")
    expect(options.revalidate).toBeGreaterThanOrEqual(30)
    expect(options.revalidate).toBeLessThanOrEqual(60)
  })

  it("still redirects a non-super-admin before touching the database", async () => {
    fromCalls.length = 0
    session.role = "MERCHANT"

    await expect(renderPage()).rejects.toThrow("redirect:/login")
    expect(fromCalls).toHaveLength(0)
    session.role = "SUPER_ADMIN"
  })
})
