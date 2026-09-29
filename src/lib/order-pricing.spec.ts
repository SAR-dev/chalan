import { describe, expect, it, vi } from "vitest"
import { resolveRoutePricing } from "./order-pricing"

const selectQueue: unknown[][] = []
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
  }
  const dbRead = { select: () => chain }
  return { dbRead, db: dbRead, pool: {} }
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
