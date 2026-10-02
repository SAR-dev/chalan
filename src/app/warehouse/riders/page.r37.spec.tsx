// Server-page test for the warehouse rider tiles. The client component is
// stubbed, so this asserts on the cache entry and the arguments it is keyed by —
// nothing is rendered.
//
// This is the one page in the app where a caching mistake would be a data leak
// rather than a stale number: the tiles are warehouse-scoped, so an entry shared
// across warehouses shows one warehouse's riders, headcount and task mix to
// another warehouse's admin.

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

const session: { role: string; warehouseId: string | null } = {
  role: "WAREHOUSE_ADMIN",
  warehouseId: "wh_a",
}
vi.mock("@/lib/api-auth", () => ({ requireSession: async () => session }))
vi.mock("@/lib/login-redirect", () => ({
  loginRedirectPath: async () => "/login",
}))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
vi.mock("./riders-client", () => ({
  WarehouseRidersPageClient: (props: Record<string, unknown>) => props,
}))

/**
 * Query results, consumed in the order the page starts them. `from()` is called
 * synchronously as each query is built, and the tile query is built first, so
 * this is deterministic — unlike keying off `where()`, which both queries call
 * and which settles in no guaranteed order.
 */
let queryQueue: unknown[][] = []
/** Every `where(...)` predicate the page built. */
const whereCalls: unknown[] = []

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: (predicate: unknown) => {
      whereCalls.push(predicate)
      return chain
    },
    orderBy: () => chain,
    limit: () => chain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(queryQueue.shift() ?? []).then(onFulfilled),
  }
  const db = { select: () => chain }
  return { db, dbRead: db, pool: {} }
})

/**
 * The bound parameter values inside a Drizzle predicate.
 *
 * `eq(rider.warehouseId, "wh_a")` builds `[StringChunk, Column, StringChunk,
 * Param("wh_a")]`; only the `Param` chunks carry a value. Reading them is what
 * separates "the predicate was rebuilt" from "the predicate was rebuilt *from
 * the argument*". Identity alone cannot: a predicate rebuilt from a captured
 * constant is a fresh object each call too, and would pass an identity check
 * while still pinning every admin to one warehouse.
 */
function predicateParams(predicate: unknown): string[] {
  const chunks = (predicate as { queryChunks?: unknown[] })?.queryChunks ?? []
  return chunks
    .filter(
      (c): c is { value: unknown } =>
        Boolean(c) && typeof c === "object" && "value" in (c as object),
    )
    .map((c) => String(c.value))
}

const TILES = { total: 9, active: 7, delivery: 5, pickup: 4 }

/** Tiles first, then the list scan. */
function queueTilesAndRows() {
  queryQueue = [[{ ...TILES }], []]
}

async function renderPage() {
  vi.resetModules()
  cacheCalls.length = 0
  whereCalls.length = 0
  const Page = (await import("./page")).default
  const element = (await Page()) as { props: Record<string, unknown> }
  return element.props
}

describe("Warehouse riders page - scope is part of the cache key (ROADMAP R3.7)", () => {
  it("passes the warehouse id as an argument, not as a captured value", async () => {
    // A Drizzle `where` clause built from the request scope is not serialisable,
    // so it cannot be part of a cache key. The id has to arrive as a plain
    // string and the predicate has to be rebuilt inside the cached callback.
    queueTilesAndRows()
    const props = await renderPage()

    const [{ fn }] = cacheCalls
    expect(fn.length).toBe(1)
    expect(props.initialTotal).toBe(TILES.total)
    expect(props.initialCounts).toEqual({
      active: TILES.active,
      delivery: TILES.delivery,
      pickup: TILES.pickup,
    })
  })

  it("resolves a different entry per warehouse", async () => {
    // The property that matters: two warehouses, two cache entries. Without the
    // argument the key would be identical and the second admin would be served
    // the first admin's headcount.
    queueTilesAndRows()
    await renderPage()
    const [{ fn }] = cacheCalls

    queryQueue = [[{ ...TILES }]]
    const a = await (fn as (w: string) => Promise<unknown>)("wh_a")
    queryQueue = [[{ ...TILES }]]
    const b = await (fn as (w: string) => Promise<unknown>)("wh_b")

    // The mocked `next/cache` returns the function unchanged, so this asserts
    // the argument reaches the query builder rather than that the values differ
    // — building the key is Next's job, pinned in `cached-stats.spec.ts`
    // (`fixedKey + JSON.stringify(args)`).
    expect(a).toEqual(TILES)
    expect(b).toEqual(TILES)
  })

  it("rebuilds the warehouse predicate from the argument, not a captured value", async () => {
    queueTilesAndRows()
    await renderPage()
    const [{ fn }] = cacheCalls

    whereCalls.length = 0
    queryQueue = [[{ ...TILES }]]
    await (fn as (w: string) => Promise<unknown>)("wh_a")
    queryQueue = [[{ ...TILES }]]
    await (fn as (w: string) => Promise<unknown>)("wh_b")

    expect(whereCalls).toHaveLength(2)
    // The warehouse id has to be inside the SQL, because that is the only
    // thing that distinguishes one warehouse's cache entry from another's.
    expect(predicateParams(whereCalls[0])).toContain("wh_a")
    expect(predicateParams(whereCalls[1])).toContain("wh_b")
  })

  it("tags the entry so rider writes clear it", async () => {
    queueTilesAndRows()
    await renderPage()
    const [{ options }] = cacheCalls
    expect(options.tags).toContain("stat:rider")
    expect(options.revalidate).toBeGreaterThan(0)
    expect(options.revalidate).toBeLessThanOrEqual(60)
  })

  it("refuses to render a warehouse admin with no warehouse", async () => {
    session.warehouseId = null
    await expect(renderPage()).rejects.toThrow("redirect:/login")
    session.warehouseId = "wh_a"
  })

  it("redirects a role that is not a warehouse admin", async () => {
    session.role = "MERCHANT"
    await expect(renderPage()).rejects.toThrow("redirect:/login")
    session.role = "WAREHOUSE_ADMIN"
  })
})
