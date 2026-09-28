import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as staleOrders } from "./route"

const CRON_SECRET = "test-secret-123"

const selectQueue: unknown[][] = []
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
  }
  const dbRead = { select: () => chain }
  return { dbRead, db: dbRead, pool: {} }
})

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
  selectQueue.length = 0
})

function authReq() {
  return new Request("http://test.local/api", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

describe("GET /api/cron/stale-orders", () => {
  it("401 without the cron secret", async () => {
    const res = await staleOrders(new Request("http://test.local/api"))
    expect(res.status).toBe(401)
  })

  it("returns stale counts per state", async () => {
    // pending, failedAttempt, inWarehouse
    selectQueue.push([{ n: 2 }], [{ n: 1 }], [{ n: 0 }])
    const res = await staleOrders(authReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      staleDays: 3,
      pending: 2,
      failedAttempt: 1,
      inWarehouse: 0,
    })
    expect(json).toHaveProperty("ranAt")
  })
})
