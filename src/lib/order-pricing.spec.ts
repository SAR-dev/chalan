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
  it("returns the zone-pair row when it matches", async () => {
    selectQueue.push(
      [
        {
          baseRate: 0,
          extraRatePerKg: 0,
          freeWeightKg: 1,
          maxWeightKg: 3,
          codFeePercentage: 1,
          cancellationFee: 0,
        },
      ], // platform
      [{ city: "Dhaka" }], // warehouse
      [{ zoneId: "ZN-1" }], // origin city
      [{ zoneId: "ZN-2" }], // destination city
      [
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
      ], // zone pricing
    )
    const pricing = await resolveRoutePricing("wh_1", "city_2")
    expect(pricing).toMatchObject({ baseRate: 100, cancellationFee: 25 })
  })

  it("falls back to platform defaults when there is no zone row", async () => {
    selectQueue.push(
      [
        {
          baseRate: 60,
          extraRatePerKg: 15,
          freeWeightKg: 1,
          maxWeightKg: 10,
          codFeePercentage: 1,
          cancellationFee: 20,
        },
      ],
      [{ city: "Dhaka" }],
      [{ zoneId: "ZN-1" }],
      [{ zoneId: "ZN-3" }],
      [], // no matching zone pricing
    )
    const pricing = await resolveRoutePricing("wh_1", "city_3")
    expect(pricing).toMatchObject({ baseRate: 60, cancellationFee: 20 })
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
