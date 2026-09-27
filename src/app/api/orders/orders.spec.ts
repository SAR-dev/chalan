import { beforeEach, describe, expect, it, vi } from "vitest"
// Receiver-note (public, token-gated) is covered by its own colocated spec:
// src/app/api/orders/[id]/receiver-note/receiver-note.spec.ts
import { GET as getOrder } from "./[id]/route"
import { GET as analytics } from "./analytics/route"
import { POST as bulkCreate } from "./bulk/route"
import { GET as orderCounts } from "./counts/route"
import { GET as payableOrders } from "./payable/route"
import { POST as createOrder, GET as listOrders } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }
let rateLimited = false

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => (rateLimited ? ({ status: 429 } as Response) : null),
  rateLimitByIp: () => (rateLimited ? ({ status: 429 } as Response) : null),
  getClientIp: () => "127.0.0.1",
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []
const whereCalls: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: (clause?: unknown) => {
        whereCalls.push(clause)
        return chain
      },
      innerJoin: () => chain,
      leftJoin: () => chain,
      groupBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
      for: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (vals: Record<string, unknown>) => {
        updatePayloads.push(vals)
        return chain
      },
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: () => chain,
      returning: () => Promise.resolve(insertResult),
      onConflictDoUpdate: () => Promise.resolve(),
    }
    return chain
  }
  const makeDeleteChain = () => {
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(),
    }
    return chain
  }
  const tx = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
    transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  whereCalls.length = 0
  sessionState.value = null
  rateLimited = false
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "order_1") {
  return { params: Promise.resolve({ id }) }
}

const merchant = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u1",
  merchantId: "m_1",
}
const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u2" }
const rider = {
  role: "RIDER",
  name: "Rider Rick",
  userId: "u3",
  riderId: "r_1",
}
const whAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u4",
  warehouseId: "wh_1",
}

const validOrderBody = {
  pickupLocationId: "pl_1",
  recipientName: "Bob",
  recipientPhone: "01712345678",
  deliveryAddress: "123 Main St",
  deliveryCity: "City",
  deliveryCityId: "city_1",
  parcelWeightKg: 2,
  productCost: 500,
}

describe("GET /api/orders", () => {
  it("401 when unauthenticated", async () => {
    const res = await listOrders(req("GET"))
    expect(res.status).toBe(401)
  })

  it("returns paginated orders for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 2 }], [{ id: "o1" }, { id: "o2" }])
    const res = await listOrders(req("GET", "http://test.local/api?limit=10"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
  })

  it("merchant sees only their orders", async () => {
    sessionState.value = merchant
    selectQueue.push([{ count: 1 }], [{ id: "o1", merchantId: "m_1" }])
    const res = await listOrders(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("merchant without merchantId returns empty", async () => {
    sessionState.value = { role: "MERCHANT", name: "M", userId: "u1" }
    const res = await listOrders(req("GET"))
    const json = await res.json()
    expect(json).toMatchObject({ data: [], total: 0 })
  })

  it("rider sees assigned orders", async () => {
    sessionState.value = rider
    selectQueue.push([{ count: 1 }], [{ id: "o1", pickupRiderId: "r_1" }])
    const res = await listOrders(req("GET"))
    expect(res.status).toBe(200)
  })

  it("warehouse admin sees relevant orders", async () => {
    sessionState.value = whAdmin
    selectQueue.push([{ count: 1 }], [{ id: "o1", warehouseId: "wh_1" }])
    const res = await listOrders(req("GET"))
    expect(res.status).toBe(200)
  })
})

describe("POST /api/orders", () => {
  it("401 when unauthenticated", async () => {
    const res = await createOrder(req("POST", undefined, validOrderBody))
    expect(res.status).toBe(401)
  })

  it("403 for non-merchant", async () => {
    sessionState.value = admin
    const res = await createOrder(req("POST", undefined, validOrderBody))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body", async () => {
    sessionState.value = merchant
    const res = await createOrder(req("POST", undefined, {}))
    expect(res.status).toBe(400)
  })

  it("creates order with warehouse routing", async () => {
    sessionState.value = merchant
    selectQueue.push(
      [{ id: "pl_1", warehouseId: "wh_hub" }], // pickup location
      [{ id: "wh_hub", isActive: true }], // warehouse hub
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          baseRate: 50,
          extraRatePerKg: 10,
          freeWeightKg: 1,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
          codFeePercentage: 1,
        },
      ], // merchant
    )
    insertResult.push({ id: "o_new", status: "PENDING" })
    const res = await createOrder(req("POST", undefined, validOrderBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "o_new" })
  })
})

describe("GET /api/orders/counts", () => {
  it("401 when unauthenticated", async () => {
    const res = await orderCounts(req("GET"))
    expect(res.status).toBe(401)
  })

  it("returns zeroes without warehouseId", async () => {
    sessionState.value = admin
    const res = await orderCounts(req("GET"))
    const json = await res.json()
    expect(json).toEqual({ failedAttempt: 0, unsettled: 0, returned: 0 })
  })

  it("returns counts for warehouse", async () => {
    sessionState.value = admin
    selectQueue.push([{ failedAttempt: 1, unsettled: 2, returned: 3 }])
    const res = await orderCounts(
      req("GET", "http://test.local/api?warehouseId=wh_1"),
    )
    const json = await res.json()
    expect(json).toEqual({ failedAttempt: 1, unsettled: 2, returned: 3 })
  })
})

describe("GET /api/orders/payable", () => {
  it("401 when unauthenticated", async () => {
    const res = await payableOrders(req("GET"))
    expect(res.status).toBe(401)
  })

  it("returns payable orders for merchant", async () => {
    sessionState.value = merchant
    selectQueue.push(
      [{ count: 1 }],
      [{ id: "o1", productCost: 500, codSettledAt: "2025-01-01" }],
    )
    const res = await payableOrders(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })
})

describe("GET /api/orders/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await getOrder(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await getOrder(req("GET"), ctx())
    expect(res.status).toBe(404)
  })

  it("returns order for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "order_1", status: "PENDING" }])
    const res = await getOrder(req("GET"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "order_1" })
  })
})

describe("POST /api/orders/bulk", () => {
  const bulkBody = {
    orders: [
      {
        pickupLocationId: "pl_1",
        recipientName: "Bob",
        recipientPhone: "01712345678",
        deliveryAddress: "123 Main St",
        deliveryCity: "City",
        deliveryCityId: "city_1",
        parcelWeightKg: 2,
        productCost: 500,
      },
    ],
  }

  it("401 when unauthenticated", async () => {
    const res = await bulkCreate(req("POST", undefined, bulkBody))
    expect(res.status).toBe(401)
  })

  it("403 for non-merchant", async () => {
    sessionState.value = admin
    const res = await bulkCreate(req("POST", undefined, bulkBody))
    expect(res.status).toBe(403)
  })

  it("creates bulk orders", async () => {
    sessionState.value = merchant
    selectQueue.push(
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          baseRate: 50,
          extraRatePerKg: 10,
          freeWeightKg: 1,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
          codFeePercentage: 1,
        },
      ],
      [{ id: "pl_1", warehouseId: "wh_1" }],
    )
    insertResult.push([{ id: "o_bulk" }])
    const res = await bulkCreate(req("POST", undefined, bulkBody))
    expect(res.status).toBe(201)
  })
})

describe("GET /api/orders/analytics", () => {
  function pushEmptyAnalytics() {
    selectQueue.push([], [], [], [])
  }

  it("401 when unauthenticated", async () => {
    const res = await analytics(req("GET"))
    expect(res.status).toBe(401)
  })

  it("super admin gets platform-wide analytics scoped only by the default 30-day window", async () => {
    sessionState.value = admin
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    // No merchant/warehouse scope, but the default window still bounds the scan
    // (ROADMAP P3) — so a where clause is present on every aggregate.
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
    expect(json).toMatchObject({
      ordersByDay: [],
      ordersByStatus: [],
      deliveryPerformance: {
        totalDelivered: 0,
        totalFailed: 0,
        totalReturned: 0,
        successRate: 0,
        avgDeliveryTimeHours: 0,
      },
      codSummary: {
        totalCollected: 0,
        totalSettled: 0,
        pendingSettlement: 0,
        settledCount: 0,
        pendingCount: 0,
      },
    })
  })

  it("super admin can scope via merchantId param", async () => {
    sessionState.value = admin
    pushEmptyAnalytics()
    const res = await analytics(
      req("GET", "http://test.local/api/orders/analytics?merchantId=m_1"),
    )
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("super admin can scope via warehouseId param", async () => {
    sessionState.value = admin
    pushEmptyAnalytics()
    const res = await analytics(
      req("GET", "http://test.local/api/orders/analytics?warehouseId=wh_1"),
    )
    expect(res.status).toBe(200)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("merchant is always scoped to own orders", async () => {
    sessionState.value = merchant
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("rider with riderId is scoped to own deliveries/pickups, never platform-wide", async () => {
    sessionState.value = rider
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("rider without riderId still never gets platform-wide data", async () => {
    sessionState.value = { role: "RIDER", name: "No Id", userId: "u5" }
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("warehouse admin is scoped to own warehouse", async () => {
    sessionState.value = whAdmin
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("applies date range from/to params", async () => {
    sessionState.value = admin
    pushEmptyAnalytics()
    const res = await analytics(
      req(
        "GET",
        "http://test.local/api/orders/analytics?from=2025-01-01&to=2025-01-31",
      ),
    )
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("ignores invalid date range params and falls back to the default window", async () => {
    sessionState.value = admin
    pushEmptyAnalytics()
    const res = await analytics(
      req("GET", "http://test.local/api/orders/analytics?from=nope&to=nope"),
    )
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(4)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("computes aggregates from query results", async () => {
    sessionState.value = admin
    selectQueue.push(
      [
        { date: "2025-01-01", count: 5, revenue: 2500 },
        { date: "2025-01-02", count: 3, revenue: 1200 },
      ],
      [
        { status: "DELIVERED", count: 8 },
        { status: "FAILED_ATTEMPT", count: 1 },
        { status: "RETURNED", count: 1 },
      ],
      [
        {
          totalDelivered: 8,
          totalFailed: 1,
          totalReturned: 1,
          avgDeliveryTimeHours: 5.56,
        },
      ],
      [
        {
          totalCollected: 1000,
          totalSettled: 400,
          settledCount: 2,
          pendingCount: 3,
        },
      ],
    )
    const res = await analytics(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ordersByDay).toHaveLength(2)
    expect(json.ordersByDay[0]).toMatchObject({ date: "2025-01-01", count: 5 })
    expect(json.ordersByStatus).toHaveLength(3)
    expect(json.deliveryPerformance).toMatchObject({
      totalDelivered: 8,
      totalFailed: 1,
      totalReturned: 1,
      successRate: 80,
      avgDeliveryTimeHours: 5.6,
    })
    expect(json.codSummary).toMatchObject({
      totalCollected: 1000,
      totalSettled: 400,
      pendingSettlement: 600,
      settledCount: 2,
      pendingCount: 3,
    })
  })
})
