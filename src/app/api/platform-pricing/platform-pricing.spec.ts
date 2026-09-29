import { describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const selectQueue: unknown[][] = []
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    limit: () => chain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
  }
  const dbRead = { select: () => chain }
  return { dbRead, db: dbRead, pool: {} }
})

describe("GET /api/platform-pricing", () => {
  it("returns the platform defaults", async () => {
    selectQueue.push([
      {
        baseRate: 60,
        extraRatePerKg: 15,
        freeWeightKg: 1,
        maxWeightKg: 10,
        codFeePercentage: 1,
        cancellationFee: 20,
      },
    ])
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ baseRate: 60, cancellationFee: 20 })
  })

  it("falls back to built-in defaults when no row exists", async () => {
    selectQueue.push([])
    const res = await GET()
    const json = await res.json()
    expect(json).toMatchObject({ baseRate: 0, freeWeightKg: 1, maxWeightKg: 3 })
  })
})
