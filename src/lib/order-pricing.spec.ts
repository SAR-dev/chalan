import { drizzle } from "drizzle-orm/pg-proxy"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/lib/db"
import {
  lockAndResolveMerchantPackageRule,
  type OrderPricingTx,
  resolveMerchantPackageRule,
  resolveRoutePricing,
} from "./order-pricing"

const selectQueue: unknown[][] = []
/** Every `.for(<strength>)` a query asked for, in order. */
const forCalls: string[] = []

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    // Intermediate builder methods — they shape one statement and must not
    // consume a queued result.
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => chain,
    for: (strength: string) => {
      forCalls.push(strength)
      return chain
    },
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
  }
  const dbRead = { select: () => chain }
  return { dbRead, db: dbRead, pool: {} }
})

/** The mocked `@/lib/db` is a bare `{ select }`, which is all `tx` needs. */
const fakeTx = db as unknown as OrderPricingTx

beforeEach(() => {
  selectQueue.length = 0
  forCalls.length = 0
})

describe("resolveRoutePricing", () => {
  /** The four statements the resolver issues, in order, for a resolvable lane. */
  const laneQueries = (zoneRow: unknown[]) => [
    [{ city: "Dhaka" }], // warehouse
    [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }], // origin city + zone
    [{ zone: { id: "ZN-2", name: "Gazipur" } }], // destination city + zone
    zoneRow,
  ]

  it("returns the zone-pair row when it matches", async () => {
    selectQueue.push(
      ...laneQueries([
        {
          fromZoneId: "ZN-1",
          toZoneId: "ZN-2",
          baseRate: 100,
          extraRatePerKg: 20,
          freeWeightKg: 1,
          maxWeightKg: 10,
          codFeePercentage: 2,
          cancellationFee: 25,
        },
      ]),
    )

    const result = await resolveRoutePricing("wh_1", "city_2")

    expect(result).toEqual({
      ok: true,
      pricing: expect.objectContaining({ baseRate: 100, cancellationFee: 25 }),
    })
    // Exactly four reads: nothing was consulted to find a fallback rate.
    expect(selectQueue).toHaveLength(0)
  })

  it("reports the missing lane by name instead of falling back", async () => {
    selectQueue.push(...laneQueries([]))

    const result = await resolveRoutePricing("wh_1", "city_3")

    expect(result).toEqual({
      ok: false,
      reason: "no-pricing-for-lane",
      fromZone: { id: "ZN-1", name: "Dhaka Metro" },
      toZone: { id: "ZN-2", name: "Gazipur" },
    })
  })

  it("never reads a platform-wide rate, even when the lane is unpriced", async () => {
    // The regression this pins: the resolver used to query `platform_config`
    // first and quietly price unconfigured lanes from it. A leftover row in
    // that table must have no effect on a missing lane.
    selectQueue.push(...laneQueries([]), [
      { baseRate: 60, cancellationFee: 20 },
    ])

    const result = await resolveRoutePricing("wh_1", "city_3")

    expect(result.ok).toBe(false)
    // The platform row is still sitting in the queue: never consumed.
    expect(selectQueue).toHaveLength(1)
  })

  it("blames the origin when the warehouse's city has no zone", async () => {
    selectQueue.push([{ city: "Dhaka" }], [])

    const result = await resolveRoutePricing("wh_1", "city_2")

    expect(result).toEqual({
      ok: false,
      reason: "origin-zone-unknown",
      fromZone: null,
      toZone: null,
    })
  })

  it("blames the destination city when none was supplied", async () => {
    selectQueue.push(
      [{ city: "Dhaka" }],
      [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }],
    )

    const result = await resolveRoutePricing("wh_1", null)

    expect(result).toEqual({
      ok: false,
      reason: "destination-city-unknown",
      fromZone: null,
      toZone: null,
    })
  })

  it("blames the destination zone when the city is unzoned", async () => {
    selectQueue.push(
      [{ city: "Dhaka" }],
      [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }],
      [{ zone: null }], // delivery city exists but has no zone
    )

    const result = await resolveRoutePricing("wh_1", "city_9")

    expect(result).toEqual({
      ok: false,
      reason: "destination-zone-unknown",
      fromZone: { id: "ZN-1", name: "Dhaka Metro" },
      toZone: null,
    })
  })
})

// The bundle lock is what makes two concurrent creates safe at a tier
// boundary: without `FOR UPDATE` both transactions would read the same
// `ordersUsed`, both price the shallow tier, and the quota would be
// double-spent. src/lib/db/integration.spec.ts proves the lock serialises
// against a real Postgres; these cases pin which statement we emit.
describe("lockAndResolveMerchantPackageRule", () => {
  it("emits SELECT … FOR UPDATE against the merchant's active bundle", async () => {
    // pg-proxy hands us the SQL drizzle generates without needing a database,
    // so the lock is asserted on the statement itself rather than on a spy.
    const statements: string[] = []
    const tx = drizzle(async (sql: string) => {
      statements.push(sql)
      return { rows: [] }
    })

    // No bundle row, so the function returns after that one locked query.
    const snapshot = await lockAndResolveMerchantPackageRule(
      tx as unknown as OrderPricingTx,
      "m_1",
    )

    expect(snapshot).toBeNull()
    expect(statements).toHaveLength(1)
    // The whole guarantee in one statement: this merchant's *active* bundle,
    // locked until the caller's transaction commits.
    expect(statements[0]).toMatch(
      /from "merchant_package" where \("merchant_package"\."merchantId" = \$1 and "merchant_package"\."isActive" = \$2\).*for update$/,
    )
  })

  it("resolves the tier unlocked at the count it just locked", async () => {
    selectQueue.push(
      [{ merchantPackageId: "mp_1", packageId: "pk_1", ordersUsed: 99 }],
      [{ isActive: true }],
      [
        {
          id: "t_shallow",
          orderCount: 10,
          sortOrder: 0,
          ruleType: "PERCENT_OFF",
          ruleValue: 10,
        },
        {
          id: "t_deep",
          orderCount: 100,
          sortOrder: 1,
          ruleType: "FLAT",
          ruleValue: 5,
        },
      ],
    )

    const snapshot = await lockAndResolveMerchantPackageRule(fakeTx, "m_1")

    expect(forCalls).toEqual(["update"])
    // 99 sits below the 100-order threshold, so the shallow tier applies …
    expect(snapshot).toMatchObject({
      merchantPackageId: "mp_1",
      ordersUsed: 99,
      tierId: "t_shallow",
      rule: { ruleType: "PERCENT_OFF", ruleValue: 10 },
    })
    // … while a bulk create still gets the whole ladder to walk up.
    expect(snapshot?.tiers.map((t) => t.id)).toEqual(["t_shallow", "t_deep"])
  })

  it("returns null when the merchant holds no active bundle", async () => {
    selectQueue.push([])
    await expect(
      lockAndResolveMerchantPackageRule(fakeTx, "m_1"),
    ).resolves.toBe(null)
  })

  it("returns null when the package itself was archived", async () => {
    // An active bundle pointing at a deactivated package prices nothing —
    // the order must fall back to the plain zone fee, not a stale discount.
    selectQueue.push(
      [{ merchantPackageId: "mp_1", packageId: "pk_1", ordersUsed: 150 }],
      [{ isActive: false }],
      [
        {
          id: "t1",
          orderCount: 100,
          sortOrder: 0,
          ruleType: "FLAT",
          ruleValue: 5,
        },
      ],
    )

    await expect(
      lockAndResolveMerchantPackageRule(fakeTx, "m_1"),
    ).resolves.toBe(null)
  })
})

describe("resolveMerchantPackageRule", () => {
  it("reads the bundle without taking a row lock", async () => {
    // Previews and calculators run on reads; locking there would serialise
    // every page render behind an order create for no benefit.
    selectQueue.push(
      [{ merchantPackageId: "mp_1", packageId: "pk_1", ordersUsed: 12 }],
      [{ isActive: true }],
      [
        {
          id: "t1",
          orderCount: 10,
          sortOrder: 0,
          ruleType: "FLAT",
          ruleValue: 5,
        },
      ],
    )

    const snapshot = await resolveMerchantPackageRule("m_1")

    expect(snapshot).toMatchObject({ tierId: "t1", rule: { ruleValue: 5 } })
    expect(forCalls).toEqual([])
  })
})
