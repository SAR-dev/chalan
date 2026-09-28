import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as listZonePricing } from "./route"

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
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = { select: () => makeSelectChain() }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  sessionState.value = null
})

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const rider = {
  role: "RIDER",
  name: "Rider Rhea",
  userId: "u3",
  riderId: "r_1",
}

describe("GET /api/zone-pricing", () => {
  it("returns zone pricing without a session (public)", async () => {
    selectQueue.push([{ id: "zp_1", fromZoneId: "z_a", toZoneId: "z_b" }])
    const res = await listZonePricing()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
    expect(json[0]).toMatchObject({ fromZoneId: "z_a", toZoneId: "z_b" })
  })

  it("returns zone pricing rows for admin", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "zp_1",
        fromZoneId: "z_dhaka",
        toZoneId: "z_chittagong",
        baseRate: 60,
        extraRatePerKg: 12,
        freeWeightKg: 1,
        maxWeightKg: 10,
        codFeePercentage: 2,
      },
      {
        id: "zp_2",
        fromZoneId: "z_dhaka",
        toZoneId: "z_sylhet",
        baseRate: 70,
        extraRatePerKg: 15,
        freeWeightKg: 1,
        maxWeightKg: 10,
        codFeePercentage: 2,
      },
    ])
    const res = await listZonePricing()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(2)
    expect(json[0]).toMatchObject({ id: "zp_1", fromZoneId: "z_dhaka" })
    expect(json[0]).toHaveProperty("baseRate")
    expect(json[0]).toHaveProperty("codFeePercentage")
  })

  it("allows merchant sessions", async () => {
    sessionState.value = merchant
    selectQueue.push([{ id: "zp_1" }])
    const res = await listZonePricing()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
  })

  it("allows rider sessions", async () => {
    sessionState.value = rider
    selectQueue.push([])
    const res = await listZonePricing()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual([])
  })

  it("returns empty array when no pricing configured", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await listZonePricing()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual([])
  })
})
