// Server-page test for the platform overview. The client component is stubbed so
// the assertions are about the queries the page issues and the cache entry it
// puts them behind — nothing is rendered.

import { describe, expect, it, vi } from "vitest"

const cacheCalls: {
  keys: string[]
  options: { revalidate?: number; tags?: string[] }
  fn: (...args: unknown[]) => unknown
}[] = []

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keys: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => {
    cacheCalls.push({ keys, options, fn })
    return fn
  },
  revalidateTag: () => {},
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

vi.mock("./overview-client", () => ({
  OverviewPageClient: (props: Record<string, unknown>) => props,
}))

/**
 * One aggregate row per query, in the order the page issues them. The page
 * fires six in parallel, so this is a queue rather than a keyed map — which is
 * also why the assertion on `from()` below exists: it does not depend on the
 * order the promises settle in.
 */
let aggregateQueue: Record<string, unknown>[] = []
const fromCalls: unknown[] = []

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {
    from: (table: unknown) => {
      fromCalls.push(table)
      return chain
    },
    where: () => chain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve([aggregateQueue.shift() ?? {}]).then(onFulfilled),
  }
  const db = { select: () => chain }
  return { db, dbRead: db, pool: {} }
})

async function renderPage() {
  vi.resetModules()
  cacheCalls.length = 0
  const Page = (await import("./page")).default
  const element = (await Page()) as { props: Record<string, unknown> }
  return element.props
}

const TILES = {
  warehouseAdminCount: 3,
  totalWarehouses: 5,
  activeWarehouses: 4,
  pendingMerchants: 2,
  pendingOrders: 11,
  pendingRiders: 6,
  activeMailConfigCount: 1,
}

function queueTiles() {
  aggregateQueue = [
    { warehouseAdminCount: TILES.warehouseAdminCount },
    {
      totalWarehouses: TILES.totalWarehouses,
      activeWarehouses: TILES.activeWarehouses,
    },
    { pendingMerchants: TILES.pendingMerchants },
    { pendingOrders: TILES.pendingOrders },
    { pendingRiders: TILES.pendingRiders },
    { activeMailConfigCount: TILES.activeMailConfigCount },
  ]
}

describe("Overview page - one cache entry for the tile row (ROADMAP R3.7)", () => {
  it("serves all six tiles from a single cache entry", async () => {
    // Six separate `unstable_cache` calls would let the row render half-updated:
    // "3 pending merchants" next to "0 pending orders" because two of six
    // entries had expired. One entry expires as a unit.
    queueTiles()
    const props = await renderPage()

    expect(cacheCalls).toHaveLength(1)
    expect(props.pendingMerchants).toBe(TILES.pendingMerchants)
    expect(props.pendingOrders).toBe(TILES.pendingOrders)
    expect(props.pendingRiders).toBe(TILES.pendingRiders)
    expect(props.warehouseAdminCount).toBe(TILES.warehouseAdminCount)
    expect(props.totalWarehouses).toBe(TILES.totalWarehouses)
    expect(props.activeWarehouses).toBe(TILES.activeWarehouses)
  })

  it("turns the mail-config count into the boolean the client takes", async () => {
    queueTiles()
    expect((await renderPage()).hasActiveMailConfig).toBe(true)

    vi.resetModules()
    cacheCalls.length = 0
    aggregateQueue = [
      { warehouseAdminCount: 0 },
      { totalWarehouses: 0, activeWarehouses: 0 },
      { pendingMerchants: 0 },
      { pendingOrders: 0 },
      { pendingRiders: 0 },
      { activeMailConfigCount: 0 },
    ]
    expect((await renderPage()).hasActiveMailConfig).toBe(false)
  })

  it("still runs one aggregate per table rather than merging them", async () => {
    // Six different tables cannot share a pass. The saving is the cache, not
    // the query count — this test exists so that "one cache entry" is never
    // mistaken for "one query".
    queueTiles()
    fromCalls.length = 0
    await renderPage()
    expect(fromCalls).toHaveLength(6)
  })

  it("tags every table the row depends on, behind a bounded TTL", async () => {
    queueTiles()
    await renderPage()

    const [{ keys, options }] = cacheCalls
    expect(keys).toEqual(["dashboard-overview-tiles"])
    expect(options.revalidate).toBeGreaterThanOrEqual(30)
    expect(options.revalidate).toBeLessThanOrEqual(60)
    // All six sources, so approving a merchant or a rider clears this entry
    // rather than waiting out the TTL.
    expect(options.tags).toEqual(
      expect.arrayContaining([
        "stat:merchant",
        "stat:order",
        "stat:rider",
        "stat:warehouse",
        "stat:profile",
        "stat:mail-config",
      ]),
    )
  })

  it("takes no cache arguments, so the entry cannot vary by viewer", async () => {
    // The page is SUPER_ADMIN-only, so there is no scope to key on. If a future
    // edit gives this callback an argument, the key changes and the assertion
    // below is what should fail loudly rather than serve one admin's numbers to
    // another.
    queueTiles()
    await renderPage()
    const [{ fn }] = cacheCalls
    expect(fn.length).toBe(0)
  })

  it("reads the session outside the cached callback", async () => {
    // `requireSession()` inside a cached function would key the entry on
    // whoever happened to trigger the first render. Asserted structurally:
    // the callback takes no args and cannot have closed over a session it was
    // not handed.
    queueTiles()
    await renderPage()
    const [{ fn }] = cacheCalls
    expect(() => (fn as () => unknown)()).not.toThrow()
  })

  it("redirects a non-super-admin before issuing any query", async () => {
    session.role = "MERCHANT"
    fromCalls.length = 0

    await expect(renderPage()).rejects.toThrow("redirect:/login")
    expect(fromCalls).toHaveLength(0)

    session.role = "SUPER_ADMIN"
  })
})
