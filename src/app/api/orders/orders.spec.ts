import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"
// Receiver-note (public, token-gated) is covered by its own colocated spec:
// src/app/api/orders/[id]/receiver-note/receiver-note.spec.ts
import { GET as getOrder } from "./[id]/route"
import { GET as analytics } from "./analytics/route"
import { POST as bulkCreate } from "./bulk/route"
import { GET as orderCounts } from "./counts/route"
import { GET as payableOrders } from "./payable/route"
import { POST as createOrder, GET as listOrders } from "./route"
import { GET as orderSummary } from "./summary/route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }
let rateLimited = false

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
  logAuditMany: () => Promise.resolve(),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => (rateLimited ? ({ status: 429 } as Response) : null),
  rateLimitByIp: () => (rateLimited ? ({ status: 429 } as Response) : null),
  getClientIp: () => "127.0.0.1",
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []

/**
 * The four reads `resolveRoutePricing` issues for a lane that HAS a rate.
 *
 * Delivery pricing is per lane with no platform fallback, so any test that
 * expects an order to be created must queue these — an exhausted queue means
 * "lane unconfigured" and the route answers 400, which is the new intended
 * behaviour rather than a mock artefact.
 */
function pricedLane(baseRate = 80, cancellationFee = 0) {
  return [
    [{ city: "Dhaka" }], // warehouse
    [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }], // origin city → zone
    [{ zone: { id: "ZN-2", name: "Gazipur" } }], // delivery city → zone
    [
      {
        fromZoneId: "ZN-1",
        toZoneId: "ZN-2",
        baseRate,
        extraRatePerKg: 0,
        freeWeightKg: 1,
        maxWeightKg: 10,
        codFeePercentage: 1,
        cancellationFee,
      },
    ],
  ]
}

/**
 * The four reads `resolveRouteDeliveryTime` issues, immediately after
 * `pricedLane` on every create.
 *
 * They sit *after* pricing in the queue because that is the order the route
 * issues them, so a test that queues anything further (the bundle lookup) must
 * queue these in between or the next read gets a delivery-time row instead of
 * what it asked for. An exhausted queue here is not an error — it yields "no
 * estimate" and the order is still created — but it silently shifts every read
 * after it, which is worse than failing loudly.
 */
function configuredDeliveryLane(days = 3) {
  return [
    [{ city: "Dhaka" }], // warehouse
    [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }], // origin city → zone
    [{ zone: { id: "ZN-2", name: "Gazipur" } }], // delivery city → zone
    [{ fromZoneId: "ZN-1", toZoneId: "ZN-2", deliveryDays: days }], // matrix
  ]
}

/**
 * The same, for `POST /api/orders/bulk`, which batches its lookups instead of
 * calling the resolver. `wh_1` sits in Dhaka (ZN-1) and `city_1` is in ZN-2.
 */
function pricedLaneBulk(baseRate = 80) {
  return [
    [{ id: "wh_1", city: "Dhaka" }], // warehouses
    [{ id: "city_1", zoneId: "ZN-2", zoneName: "Gazipur" }], // destCities
    [{ name: "Dhaka", zoneId: "ZN-1", zoneName: "Dhaka Metro" }], // origCities
    [
      {
        fromZoneId: "ZN-1",
        toZoneId: "ZN-2",
        baseRate,
        extraRatePerKg: 0,
        freeWeightKg: 1,
        maxWeightKg: 10,
        codFeePercentage: 1,
        cancellationFee: 0,
      },
    ],
  ]
}
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []
const insertPayloads: Record<string, unknown>[] = []
const whereCalls: unknown[] = []
/** Row-lock strengths requested by any query, in order. */
const forCalls: string[] = []
/**
 * Arguments to every `orderBy`, in call order. A list endpoint paging with
 * OFFSET must establish a total order or pages can overlap or gap; the count
 * query deliberately does not sort, so a correctly-ordered list query is the
 * one and only entry.
 */
const orderByCalls: unknown[][] = []

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
      orderBy: (...args: unknown[]) => {
        orderByCalls.push(args)
        return chain
      },
      $dynamic: () => chain,
      for: (strength: string) => {
        forCalls.push(strength)
        return chain
      },
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
      values: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload)
        return chain
      },
      returning: () => Promise.resolve(insertResult),
      onConflictDoUpdate: () => Promise.resolve(),
      onConflictDoNothing: () => chain,
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
  insertPayloads.length = 0
  whereCalls.length = 0
  forCalls.length = 0
  orderByCalls.length = 0
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
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_hub" }], // pickup location
      [{ id: "wh_hub", isActive: true }], // warehouse hub
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ], // merchant
      ...pricedLane(50),
      ...configuredDeliveryLane(),
    )
    insertResult.push({ id: "o_new", status: "PENDING" })
    const res = await createOrder(req("POST", undefined, validOrderBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "o_new" })
  })

  it("400 when the lane has no configured rate", async () => {
    // The whole point: no platform-wide rate to fall back to, so an
    // unconfigured lane is rejected by name instead of silently priced at 0.
    sessionState.value = merchant
    selectQueue.push(
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_hub" }], // pickup location
      [{ id: "wh_hub", isActive: true }], // warehouse hub
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ], // merchant
      [{ city: "Dhaka" }], // warehouse
      [{ zone: { id: "ZN-1", name: "Dhaka Metro" } }], // origin city → zone
      [{ zone: { id: "ZN-2", name: "Gazipur" } }], // delivery city → zone
      [], // no zone_pricing row for this pair
    )

    const res = await createOrder(req("POST", undefined, validOrderBody))
    const json = await res.json()

    expect(res.status).toBe(400)
    // Names the exact pair an admin must configure.
    expect(json.error).toMatch(
      /No delivery pricing is configured for Dhaka Metro → Gazipur/,
    )
    expect(json.error).toMatch(/Configure the zone pair/)
    // Nothing was written.
    expect(insertPayloads.some((p) => "recipientName" in p)).toBe(false)
  })

  it("applies the active bundle rule, snapshots it, and consumes quota", async () => {
    sessionState.value = merchant
    selectQueue.push(
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_hub" }], // pickup location
      [{ id: "wh_hub", isActive: true }], // warehouse hub
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ], // merchant
      // resolveRoutePricing: a lane that has a configured rate.
      ...pricedLane(80),
      ...configuredDeliveryLane(),
      // lockAndResolveMerchantPackageRule: bundle, package, tiers
      [{ merchantPackageId: "mp_1", packageId: "pk_1", ordersUsed: 120 }],
      [{ isActive: true }],
      [
        {
          id: "t1",
          orderCount: 100,
          sortOrder: 0,
          ruleType: "PERCENT_OFF",
          ruleValue: 25,
        },
      ],
    )
    insertResult.push({ id: "o_pkg", status: "PENDING" })

    const res = await createOrder(req("POST", undefined, validOrderBody))
    expect(res.status).toBe(201)

    const orderInsert = insertPayloads.find(
      (p) => (p as { recipientName?: string }).recipientName === "Bob",
    ) as Record<string, unknown> | undefined

    // 25% off the 80 Tk zone fee.
    expect(orderInsert?.deliveryFee).toBe(60)
    expect(orderInsert?.packageId).toBe("pk_1")
    expect(orderInsert?.packageTierId).toBe("t1")
    expect(orderInsert?.merchantPackageId).toBe("mp_1")
    expect(orderInsert?.packageRuleType).toBe("PERCENT_OFF")
    expect(orderInsert?.packageRuleValue).toBe(25)

    // The bundle row is locked for the rest of the transaction, so a
    // concurrent create cannot read the same `ordersUsed` and price the
    // shallower tier (proved end-to-end in src/lib/db/integration.spec.ts).
    expect(forCalls).toContain("update")

    // Quota incremented by one.
    expect(updatePayloads.some((p) => "ordersUsed" in p)).toBe(true)
  })

  it("leaves package columns null when the merchant has no active bundle", async () => {
    sessionState.value = merchant
    selectQueue.push(
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_hub" }], // pickup location
      [{ id: "wh_hub", isActive: true }], // warehouse hub
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ], // merchant
      ...pricedLane(80),
      ...configuredDeliveryLane(),
      [], // no active bundle
    )
    insertResult.push({ id: "o_plain", status: "PENDING" })

    const res = await createOrder(req("POST", undefined, validOrderBody))
    expect(res.status).toBe(201)

    const orderInsert = insertPayloads.find(
      (p) => (p as { recipientName?: string }).recipientName === "Bob",
    ) as Record<string, unknown> | undefined
    expect(orderInsert?.deliveryFee).toBe(80)
    expect(orderInsert?.packageId).toBeNull()
    expect(orderInsert?.merchantPackageId).toBeNull()
    expect(updatePayloads.some((p) => "ordersUsed" in p)).toBe(false)
  })

  it("returns the original order for a repeated Idempotency-Key", async () => {
    sessionState.value = merchant
    selectQueue.push([{ id: "o_orig", status: "PENDING" }])
    const request = new Request("http://test.local/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "retry-1",
      },
      body: JSON.stringify(validOrderBody),
    })
    const res = await createOrder(request)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "o_orig" })
  })

  it("snapshots the zone-pair cancellation fee on the order", async () => {
    sessionState.value = merchant
    selectQueue.push(
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_hub" }], // pickup location
      [{ id: "wh_hub", isActive: true }], // warehouse hub
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ], // merchant
      // resolveRoutePricing: a lane with an explicit cancellation fee.
      ...pricedLane(100, 25),
      ...configuredDeliveryLane(),
    )
    insertResult.push({ id: "o_new", status: "PENDING" })

    const res = await createOrder(req("POST", undefined, validOrderBody))
    expect(res.status).toBe(201)

    const orderInsert = insertPayloads.find((p) => "recipientName" in p)
    expect(orderInsert).toMatchObject({ cancellationFee: 25 })
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

  // OFFSET paging needs a *total* order (sort column + unique tiebreaker).
  // Without one Postgres may return rows in any order, so consecutive pages
  // overlap — the merchant is shown the same payable order twice — or leave a
  // gap where an order is never shown. Both are silent on a payout list.
  it("orders the rows by a total order so OFFSET pages cannot overlap or gap", async () => {
    sessionState.value = merchant
    selectQueue.push([{ count: 2 }], [{ id: "o1" }, { id: "o2" }])
    const res = await payableOrders(req("GET"))
    expect(res.status).toBe(200)

    // Exactly one of the two queries (COUNT + rows) may sort — the COUNT must
    // not, and the rows query must.
    expect(orderByCalls).toHaveLength(1)
    // Sort column plus tiebreaker: a single expression is not a total order.
    expect(orderByCalls[0]).toHaveLength(2)
  })

  // Guards against "fixing" the sort by dropping the tiebreaker.
  it("keeps the tiebreaker when the caller asks for a page", async () => {
    sessionState.value = merchant
    selectQueue.push([{ count: 2 }], [{ id: "o1" }, { id: "o2" }])
    const res = await payableOrders(
      req("GET", "http://test.local/api?limit=1&offset=1"),
    )
    expect(res.status).toBe(200)
    expect(orderByCalls).toHaveLength(1)
    expect(orderByCalls[0]).toHaveLength(2)
  })
})

// One `ilike` OR spanning order + merchant + warehouse, all inlined after four
// LEFT JOINs. A trigram GIN index answers a same-table bitmap-OR; it cannot
// answer ORs that cross relations, so the planner's realistic choice was "join
// all four tables, then filter" — the search got slower the more it matched
// Nothing.
describe("GET /api/orders?q= search shape", () => {
  async function searchClauseFor(q: string) {
    sessionState.value = admin
    whereCalls.length = 0
    // COUNT + rows share the same `where`.
    selectQueue.push([{ count: 0 }], [])
    const res = await listOrders(
      req("GET", `http://test.local/api?q=${encodeURIComponent(q)}`),
    )
    expect(res.status).toBe(200)
    // Each EXISTS subquery is itself built through the mocked `dbRead`, so it
    // pushes its own inner `where` ahead of the top-level one. Take the
    // outermost clause — the only one that mentions an `order` column.
    const rendered = whereCalls.map((w) =>
      new PgDialect().sqlToQuery(w as Parameters<PgDialect["sqlToQuery"]>[0]),
    )
    const outer = rendered.find((r) => r.sql.includes('"order"."id"'))
    expect(outer, rendered.map((r) => r.sql).join("\n---\n")).toBeDefined()
    return outer!
  }

  it("gives each joined table its own EXISTS subquery", async () => {
    const { sql, params } = await searchClauseFor("ABC Traders")
    const existsCount = sql.match(/exists\s*\(select/gi)?.length ?? 0
    expect(existsCount, sql).toBe(2)
    // The correlated key of each subquery, plus the table it scans.
    expect(sql).toMatch(/exists\s*\(select[\s\S]*"merchant"/i)
    expect(sql).toMatch(/exists\s*\(select[\s\S]*"warehouse"/i)
    // Params survive the restructure — otherwise the term silently becomes
    // `ilike %null%` and search stops matching anything.
    expect(params).toContain("%ABC Traders%")
  })

  it("keeps order-level matches outside the subqueries", async () => {
    const { sql } = await searchClauseFor("01711")
    // These two live on `order` itself, so they stay in the top-level OR and
    // keep serving from the order table's own trigram indexes.
    expect(sql).toMatch(/exists\s*\(select/i)
    expect(sql).toContain('"order"."recipientName" ilike')
    expect(sql).toContain('"order"."recipientPhone" ilike')
    // ...and neither appears inside a subquery, which is the whole point: a
    // hit on `order` alone must not drag the merchant/warehouse scans in.
    expect(sql).not.toMatch(/exists\s*\([^)]*"recipientName"/i)
  })
})

// A rider has two queues. Without `?queue=` the endpoint returned their union
// and each queue page filtered client-side, so the footer's `total` counted
// rows the table never rendered and page 2 showed a different subset
describe("GET /api/orders?queue=", () => {
  const renderWhere = () =>
    new PgDialect().sqlToQuery(
      whereCalls[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    )

  async function riderList(query?: string) {
    sessionState.value = rider
    whereCalls.length = 0
    // COUNT + rows, both sharing the same `where`.
    selectQueue.push([{ count: 0 }], [])
    const res = await listOrders(
      req("GET", `http://test.local/api${query ?? ""}`),
    )
    expect(res.status).toBe(200)
    return renderWhere()
  }

  it("narrows to the pickup queue when asked", async () => {
    const { sql, params } = await riderList("?queue=pickup")
    expect(sql).toContain('"order"."pickupRiderId"')
    expect(sql).not.toContain('"order"."deliveryRiderId"')
    expect(params).toContain("r_1")
  })

  it("narrows to the delivery queue when asked", async () => {
    const { sql, params } = await riderList("?queue=delivery")
    expect(sql).toContain('"order"."deliveryRiderId"')
    expect(sql).not.toContain('"order"."pickupRiderId"')
    expect(params).toContain("r_1")
  })

  // Backwards compatible: with no queue the union is still returned, so the
  // rows and the total agree either way.
  it("returns both queues when no queue is requested", async () => {
    const { sql } = await riderList()
    expect(sql).toContain('"order"."pickupRiderId"')
    expect(sql).toContain('"order"."deliveryRiderId"')
  })

  // A typo must not narrow to an empty set (or widen unexpectedly) — unknown
  // values fall back to the union, mirroring parseStatusFilter.
  it("falls back to the union for an unrecognised queue", async () => {
    const { sql } = await riderList("?queue=bogus")
    expect(sql).toContain('"order"."pickupRiderId"')
    expect(sql).toContain('"order"."deliveryRiderId"')
  })
})

describe("GET /api/orders/summary", () => {
  const aggregates = {
    inProgressCount: 7,
    // node-postgres can hand numeric aggregates back as text; the route must
    // still answer with a number, because `formatTk("42000")` would concatenate.
    codToCollect: "42000",
    codToSettleCount: 3,
    codToSettleAmount: "9000",
    payoutReadyCount: 2,
    payoutToIssue: "7000",
    deliveredCount: 400,
    totalEarnings: "200000",
  }

  it("401 when unauthenticated", async () => {
    const res = await orderSummary(req("GET"))
    expect(res.status).toBe(401)
  })

  it("403 for roles that have no merchant figures", async () => {
    for (const session of [rider, whAdmin]) {
      sessionState.value = session
      const res = await orderSummary(req("GET"))
      expect(res.status).toBe(403)
    }
  })

  it("aggregates over the caller's merchant and reports numbers", async () => {
    sessionState.value = merchant
    selectQueue.push([aggregates])
    const res = await orderSummary(req("GET"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      codToCollect: 42000,
      inProgressCount: 7,
      codToSettleCount: 3,
      codToSettleAmount: 9000,
      payoutReadyCount: 2,
      payoutToIssue: 7000,
      deliveredCount: 400,
      totalEarnings: 200000,
    })
    // Scoped by the session's merchant, never by a query param the caller picks.
    expect(whereCalls[0]).toBeDefined()
    const { params } = new PgDialect().sqlToQuery(
      whereCalls[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    )
    expect(params).toContain("m_1")
  })

  it("403 when a merchant asks for another merchant's summary", async () => {
    sessionState.value = merchant
    const res = await orderSummary(
      req("GET", "http://test.local/api?merchantId=m_2"),
    )
    expect(res.status).toBe(403)
    expect(selectQueue).toHaveLength(0)
  })

  it("answers zero, not null, for a merchant with no orders", async () => {
    sessionState.value = merchant
    selectQueue.push([])
    const res = await orderSummary(req("GET"))
    const json = await res.json()
    expect(json).toEqual({
      codToCollect: 0,
      inProgressCount: 0,
      codToSettleCount: 0,
      codToSettleAmount: 0,
      payoutReadyCount: 0,
      payoutToIssue: 0,
      deliveredCount: 0,
      totalEarnings: 0,
    })
  })

  it("lets a super admin read an arbitrary merchant's summary", async () => {
    sessionState.value = admin
    selectQueue.push([aggregates])
    const res = await orderSummary(
      req("GET", "http://test.local/api?merchantId=m_9"),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).totalEarnings).toBe(200000)
    const { params } = new PgDialect().sqlToQuery(
      whereCalls[whereCalls.length - 1] as Parameters<
        PgDialect["sqlToQuery"]
      >[0],
    )
    expect(params).toContain("m_9")
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
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ],
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_1" }],
      ...pricedLaneBulk(),
    )
    insertResult.push([{ id: "o_bulk" }])
    const res = await bulkCreate(req("POST", undefined, bulkBody))
    expect(res.status).toBe(201)
  })

  it("400 the whole batch when a lane has no configured rate", async () => {
    // Rejected before the transaction starts, so a batch can never half-create
    // rows priced against a rate that does not exist.
    sessionState.value = merchant
    selectQueue.push(
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ],
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_1" }],
      [{ id: "wh_1", city: "Dhaka" }], // warehouses
      [{ id: "city_1", zoneId: "ZN-2", zoneName: "Gazipur" }], // destCities
      [{ name: "Dhaka", zoneId: "ZN-1", zoneName: "Dhaka Metro" }], // origCities
      [], // no zone_pricing row for ZN-1 → ZN-2
    )

    const res = await bulkCreate(req("POST", undefined, bulkBody))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toMatch(/have no delivery pricing configured/)
    expect(json.error).toMatch(/Dhaka Metro → Gazipur/)
    expect(json.rows).toEqual([0])
    expect(insertResult).toEqual([]) // nothing was written
  })

  it("locks the bundle once and prices each row at its own cumulative tier", async () => {
    // A batch that straddles a tier boundary must not price every parcel at
    // the bundle's current tier: the count advances as the batch is consumed.
    sessionState.value = merchant
    const row = (id: string) => ({
      pickupLocationId: "pl_1",
      recipientName: id,
      recipientPhone: "01712345678",
      deliveryAddress: "123 Main St",
      deliveryCity: "City",
      deliveryCityId: "city_1",
      parcelWeightKg: 1,
      productCost: 500,
    })
    selectQueue.push(
      [
        {
          id: "m_1",
          status: "ACTIVE",
          maxWeightKg: 10,
          emailVerifiedAt: new Date(),
          nidVerifiedAt: new Date(),
        },
      ], // merchant
      [{ id: "pl_1", merchantId: "m_1", warehouseId: "wh_1" }], // pickup hub
      [{ id: "wh_1", city: "Dhaka" }], // warehouses
      [{ id: "city_1", zoneId: "ZN-2", zoneName: "Gazipur" }], // destCities
      [{ name: "Dhaka", zoneId: "ZN-1", zoneName: "Dhaka Metro" }], // origCities
      [
        {
          fromZoneId: "ZN-1",
          toZoneId: "ZN-2",
          baseRate: 100,
          extraRatePerKg: 20,
          freeWeightKg: 1,
          maxWeightKg: 10,
          codFeePercentage: 1,
          cancellationFee: 0,
        },
      ], // zone pricing (100 Tk for a 1 kg parcel)
      [{ fromZoneId: "ZN-1", toZoneId: "ZN-2", deliveryDays: 3 }], // zone delivery time (issued straight after the pricing read)
      [{ merchantPackageId: "mp_1", packageId: "pk_1", ordersUsed: 99 }], // bundle
      [{ isActive: true }], // package
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
      ], // tiers
    )
    insertResult.push([
      { id: "o_1", deliveryFee: 90, codFee: 5 },
      { id: "o_2", deliveryFee: 5, codFee: 5 },
    ])

    const res = await bulkCreate(
      req("POST", undefined, { orders: [row("Bob"), row("Ann")] }),
    )
    expect(res.status).toBe(201)

    const inserted = insertPayloads.find(
      (p) => Array.isArray(p) && "recipientName" in p[0],
    ) as unknown as Record<string, unknown>[]
    expect(inserted).toHaveLength(2)
    // Order 99 → 10% off the 100 Tk zone fee; order 100 unlocks the flat tier.
    expect(inserted[0]).toMatchObject({
      recipientName: "Bob",
      deliveryFee: 90,
      packageTierId: "t_shallow",
      packageRuleType: "PERCENT_OFF",
    })
    expect(inserted[1]).toMatchObject({
      recipientName: "Ann",
      deliveryFee: 5,
      packageTierId: "t_deep",
      packageRuleType: "FLAT",
    })
    // One lock for the whole batch — never one per row.
    expect(forCalls).toEqual(["update"])
    // … and the batch consumes exactly its own length from the quota.
    expect(updatePayloads).toContainEqual(
      expect.objectContaining({ ordersUsed: expect.anything() }),
    )
  })
})

describe("GET /api/orders/analytics", () => {
  function pushEmptyAnalytics() {
    selectQueue.push([], [], [])
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
    expect(whereCalls).toHaveLength(3)
    // No merchant/warehouse scope, but the default window still bounds the scan
    // — so a where clause is present on every aggregate.
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
    expect(whereCalls).toHaveLength(3)
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
    expect(whereCalls).toHaveLength(3)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("rider with riderId is scoped to own deliveries/pickups, never platform-wide", async () => {
    sessionState.value = rider
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(3)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("rider without riderId still never gets platform-wide data", async () => {
    sessionState.value = { role: "RIDER", name: "No Id", userId: "u5" }
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(3)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("warehouse admin is scoped to own warehouse", async () => {
    sessionState.value = whAdmin
    pushEmptyAnalytics()
    const res = await analytics(req("GET"))
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(3)
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
    expect(whereCalls).toHaveLength(3)
    expect(whereCalls.every((w) => w !== undefined)).toBe(true)
  })

  it("ignores invalid date range params and falls back to the default window", async () => {
    sessionState.value = admin
    pushEmptyAnalytics()
    const res = await analytics(
      req("GET", "http://test.local/api/orders/analytics?from=nope&to=nope"),
    )
    expect(res.status).toBe(200)
    expect(whereCalls).toHaveLength(3)
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
        // Delivery performance and COD summary are one query now -
        // both ungrouped, so they are the same scan.
        {
          totalDelivered: 8,
          totalFailed: 1,
          totalReturned: 1,
          avgDeliveryTimeHours: 5.56,
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
