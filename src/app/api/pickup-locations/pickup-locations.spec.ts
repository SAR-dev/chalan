import { beforeEach, describe, expect, it, vi } from "vitest"
import { DELETE as deletePickupLocation, PATCH as updatePickupLocation } from "./[id]/route"
import { GET as listPickupLocations, POST as createPickupLocation } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }
let rateLimited = false

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => (rateLimited ? ({ status: 429 } as Response) : null),
  rateLimitByIp: () => (rateLimited ? ({ status: 429 } as Response) : null),
  getClientIp: () => "127.0.0.1",
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: () => chain,
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const makeDeleteChain = () => {
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  insertResult.length = 0
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

function ctx(id = "pl_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const warehouseAdminSession = {
  role: "WAREHOUSE_ADMIN",
  name: "Warehouse Wendy",
  userId: "u3",
  warehouseId: "wh_1",
}
const riderSession = {
  role: "RIDER",
  name: "Rider Rhea",
  userId: "u4",
  riderId: "r_1",
}

describe("GET /api/pickup-locations", () => {
  it("401 when unauthenticated", async () => {
    const res = await listPickupLocations(req("GET"))
    expect(res.status).toBe(401)
  })

  it("merchant sees own locations", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ count: 1 }], [{ id: "pl_1", merchantId: "m_1" }])
    const res = await listPickupLocations(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("admin sees all with merchantId param", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 2 }], [{ id: "pl_1" }, { id: "pl_2" }])
    const res = await listPickupLocations(
      req("GET", "http://test.local/api?merchantId=m_1"),
    )
    expect(res.status).toBe(200)
  })

  it("warehouse admin sees own warehouse's locations", async () => {
    sessionState.value = warehouseAdminSession
    selectQueue.push([{ count: 1 }], [{ id: "pl_1" }])
    const res = await listPickupLocations(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("warehouse admin may filter by merchant within their warehouse", async () => {
    sessionState.value = warehouseAdminSession
    selectQueue.push([{ count: 1 }], [{ id: "pl_1" }])
    const res = await listPickupLocations(
      req("GET", "http://test.local/api?merchantId=m_1"),
    )
    expect(res.status).toBe(200)
  })

  it("warehouse admin without a warehouse gets an empty list", async () => {
    sessionState.value = { role: "WAREHOUSE_ADMIN", userId: "u3" }
    const res = await listPickupLocations(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(0)
  })

  it("rider sees only their warehouse's locations", async () => {
    sessionState.value = riderSession
    selectQueue.push(
      [{ warehouseId: "wh_1" }],
      [{ count: 2 }],
      [{ id: "pl_1" }, { id: "pl_2" }],
    )
    const res = await listPickupLocations(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
  })

  it("rider without a riderId gets an empty list", async () => {
    sessionState.value = { role: "RIDER", userId: "u4" }
    const res = await listPickupLocations(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(0)
  })
})

describe("POST /api/pickup-locations", () => {
  const validBody = { label: "Shop 1", address: "Addr", cityId: "city_1" }

  it("401 when unauthenticated", async () => {
    const res = await createPickupLocation(req("POST", undefined, validBody))
    expect(res.status).toBe(401)
  })

  it("403 for non-merchant", async () => {
    sessionState.value = admin
    const res = await createPickupLocation(req("POST", undefined, validBody))
    expect(res.status).toBe(403)
  })

  it("creates pickup location", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "city_1", isActive: true }])
    insertResult.push({ id: "pl_new", label: "Shop 1" })
    const res = await createPickupLocation(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "pl_new" })
  })
})

describe("PATCH /api/pickup-locations/:id", () => {
  const validBody = {
    label: "Updated Shop",
    address: "New addr",
    cityId: "city_1",
  }

  it("401 when unauthenticated", async () => {
    const res = (await updatePickupLocation(
      req("PATCH", undefined, validBody),
      ctx(),
    ))!
    expect(res.status).toBe(401)
  })

  it("updates location", async () => {
    sessionState.value = merchantSession
    selectQueue.push(
      [{ merchantId: "m_1" }],
      [{ id: "city_1", isActive: true }],
    )
    updateResult.push([{ id: "pl_1", label: "Updated Shop" }])
    const res = (await updatePickupLocation(
      req("PATCH", undefined, validBody),
      ctx(),
    ))!
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toBeDefined()
  })
})

describe("DELETE /api/pickup-locations/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = (await deletePickupLocation(req("DELETE"), ctx()))!
    expect(res.status).toBe(401)
  })

  it("deletes location", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ merchantId: "m_1" }], [])
    const res = (await deletePickupLocation(req("DELETE"), ctx()))!
    expect(res.status).toBe(200)
  })

  it("409 when orders reference it", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ merchantId: "m_1" }], [{ id: "o1" }])
    const res = (await deletePickupLocation(req("DELETE"), ctx()))!
    expect(res.status).toBe(409)
  })
})
