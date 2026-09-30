import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    selectDistinct: () => makeSelectChain(),
  }
  return { db, dbRead: { ...db }, pool: {} }
})

const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u1" }
const warehouseAdmin = { role: "WAREHOUSE_ADMIN", name: "WH", userId: "u2" }
const merchant = { role: "MERCHANT", name: "M", userId: "u3" }

/**
 * Queues the four lookups, in the order `Promise.all` resolves them: zones,
 * origin zones, destination zones, already-configured pairs.
 *
 * `origin` and `destination` here are the *distinct zone* results the joins
 * produce — so passing `[]` for `origin` means "no warehouse city maps to a
 * zoned city".
 */
function queueCoverage({
  origins,
  destinations,
  configured = [],
}: {
  origins: Array<{ zoneId: string }>
  destinations: Array<{ zoneId: string }>
  configured?: Array<{ fromZoneId: string; toZoneId: string }>
}) {
  selectQueue.push(
    [
      { id: "ZN-1", name: "Dhaka Metro" },
      { id: "ZN-2", name: "Gazipur" },
      { id: "ZN-3", name: "Sylhet" },
    ], // zones
    origins,
    destinations,
    configured,
  )
}

beforeEach(() => {
  selectQueue.length = 0
  sessionState.value = null
})

describe("GET /api/admin/pricing-coverage", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("403 for a warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("403 for a merchant", async () => {
    sessionState.value = merchant
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("lists every reachable pair that has no rate", async () => {
    sessionState.value = superAdmin
    // One origin zone, two destination zones, neither pair priced.
    queueCoverage({
      origins: [{ zoneId: "ZN-1" }],
      destinations: [{ zoneId: "ZN-1" }, { zoneId: "ZN-2" }],
    })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.missing).toEqual([
      {
        fromZoneId: "ZN-1",
        fromZoneName: "Dhaka Metro",
        toZoneId: "ZN-1",
        toZoneName: "Dhaka Metro",
      },
      {
        fromZoneId: "ZN-1",
        fromZoneName: "Dhaka Metro",
        toZoneId: "ZN-2",
        toZoneName: "Gazipur",
      },
    ])
    expect(json.reachablePairCount).toBe(2)
    expect(json.configuredPairCount).toBe(0)
  })

  it("omits a pair that already has a rate", async () => {
    sessionState.value = superAdmin
    queueCoverage({
      origins: [{ zoneId: "ZN-1" }],
      destinations: [{ zoneId: "ZN-1" }, { zoneId: "ZN-2" }],
      configured: [{ fromZoneId: "ZN-1", toZoneId: "ZN-1" }],
    })

    const json = await (await GET()).json()

    expect(json.missing).toHaveLength(1)
    expect(json.missing[0]).toMatchObject({
      fromZoneName: "Dhaka Metro",
      toZoneName: "Gazipur",
    })
    expect(json.configuredPairCount).toBe(1)
  })

  it("ignores a rate for a lane nothing can reach", async () => {
    // Directional: ZN-1 → ZN-3 is configured, but Sylhet is not a destination
    // of any order, so it is not a missing lane.
    sessionState.value = superAdmin
    queueCoverage({
      origins: [{ zoneId: "ZN-1" }],
      destinations: [{ zoneId: "ZN-1" }],
      configured: [
        { fromZoneId: "ZN-1", toZoneId: "ZN-1" },
        { fromZoneId: "ZN-1", toZoneId: "ZN-3" },
      ],
    })

    const json = await (await GET()).json()

    expect(json.missing).toEqual([])
    expect(json.reachablePairCount).toBe(1)
    expect(json.configuredPairCount).toBe(2)
  })

  it("reports zero reachable pairs rather than a huge cross product", async () => {
    // No warehouse city maps to a zoned city, so nothing is orderable yet —
    // an empty to-do list, not N×N gaps.
    sessionState.value = superAdmin
    queueCoverage({
      origins: [],
      destinations: [{ zoneId: "ZN-1" }, { zoneId: "ZN-2" }],
    })

    const json = await (await GET()).json()

    expect(json.missing).toEqual([])
    expect(json.reachablePairCount).toBe(0)
    expect(json.originZoneCount).toBe(0)
    expect(json.destinationZoneCount).toBe(2)
  })

  it("excludes a zone whose name is unresolvable, from both the list and the count", async () => {
    // A zone row removed between the two reads must not be counted as a gap
    // while being omitted from the list — the card would promise more gaps
    // than it shows.
    sessionState.value = superAdmin
    selectQueue.push(
      [{ id: "ZN-1", name: "Dhaka Metro" }], // zones
      [{ zoneId: "ZN-1" }], // origins
      [{ zoneId: "ZN-1" }, { zoneId: "ZN-GONE" }], // destinations
      [], // configured
    )

    const json = await (await GET()).json()

    expect(json.destinationZoneCount).toBe(1)
    expect(json.reachablePairCount).toBe(1)
    expect(json.missing).toEqual([
      {
        fromZoneId: "ZN-1",
        fromZoneName: "Dhaka Metro",
        toZoneId: "ZN-1",
        toZoneName: "Dhaka Metro",
      },
    ])
  })
})
