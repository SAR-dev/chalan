import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE as deleteCity,
  PATCH as updateCity,
} from "@/app/api/admin/delivery-cities/[id]/route"
import {
  POST as createCity,
  GET as listCities,
} from "@/app/api/admin/delivery-cities/route"
import { GET as listActiveCities } from "@/app/api/delivery-cities/route"

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
      limit: () => chain,
      orderBy: () => chain,
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
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u1" }
const merchantSession = { role: "MERCHANT", name: "Merchant", userId: "u2" }

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  insertResult.length = 0
  sessionState.value = null
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "city_1") {
  return { params: Promise.resolve({ id }) }
}

// ---------------------------------------------------------------------------
// Admin: GET /api/admin/delivery-cities
// ---------------------------------------------------------------------------

describe("GET /api/admin/delivery-cities", () => {
  it("401 when unauthenticated", async () => {
    const res = await listCities()
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await listCities()
    expect(res.status).toBe(403)
  })

  it("returns cities for super admin", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "c1", name: "Dhaka", isActive: true }])
    const res = await listCities()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
    expect(json[0].name).toBe("Dhaka")
  })
})

// ---------------------------------------------------------------------------
// Admin: POST /api/admin/delivery-cities
// ---------------------------------------------------------------------------

describe("POST /api/admin/delivery-cities", () => {
  it("401 when unauthenticated", async () => {
    const res = await createCity(
      req("POST", { name: "Dhaka", zoneId: "z_1", warehouseId: "wh_1" }),
    )
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await createCity(
      req("POST", { name: "Dhaka", zoneId: "z_1", warehouseId: "wh_1" }),
    )
    expect(res.status).toBe(403)
  })

  it("400 when name is empty", async () => {
    sessionState.value = superAdmin
    const res = await createCity(
      req("POST", { name: "", zoneId: "z_1", warehouseId: "wh_1" }),
    )
    expect(res.status).toBe(400)
  })

  it("creates city for super admin", async () => {
    sessionState.value = superAdmin
    insertResult.push({ id: "c1", name: "Dhaka", isActive: true })
    const res = await createCity(
      req("POST", { name: "Dhaka", zoneId: "z_1", warehouseId: "wh_1" }),
    )
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.name).toBe("Dhaka")
  })
})

// ---------------------------------------------------------------------------
// Admin: PATCH /api/admin/delivery-cities/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/delivery-cities/[id]", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateCity(req("PATCH", { isActive: false }), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await updateCity(req("PATCH", { isActive: false }), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when city not found", async () => {
    sessionState.value = superAdmin
    updateResult.push(undefined)
    const res = await updateCity(req("PATCH", { isActive: false }), ctx())
    expect(res.status).toBe(404)
  })

  it("updates city", async () => {
    sessionState.value = superAdmin
    updateResult.push({ id: "c1", name: "Dhaka", isActive: false })
    const res = await updateCity(req("PATCH", { isActive: false }), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.isActive).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Admin: DELETE /api/admin/delivery-cities/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/delivery-cities/[id]", () => {
  it("401 when unauthenticated", async () => {
    const res = await deleteCity(req("DELETE"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await deleteCity(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when city not found", async () => {
    sessionState.value = superAdmin
    updateResult.push(undefined)
    const res = await deleteCity(req("DELETE"), ctx())
    expect(res.status).toBe(404)
  })

  it("soft-deletes city", async () => {
    sessionState.value = superAdmin
    updateResult.push({ id: "c1", isActive: false })
    const res = await deleteCity(req("DELETE"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Public: GET /api/delivery-cities
// ---------------------------------------------------------------------------

describe("GET /api/delivery-cities", () => {
  it("401 when unauthenticated", async () => {
    const res = await listActiveCities()
    expect(res.status).toBe(401)
  })

  it("returns active cities for any user", async () => {
    sessionState.value = merchantSession
    selectQueue.push([
      { id: "c1", name: "Dhaka" },
      { id: "c2", name: "Chittagong" },
    ])
    const res = await listActiveCities()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(2)
  })
})
