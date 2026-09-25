import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE as deleteZone,
  PATCH as updateZone,
} from "@/app/api/admin/delivery-zones/[id]/route"
import {
  POST as createZone,
  GET as listAdminZones,
} from "@/app/api/admin/delivery-zones/route"
import { GET as listActiveZones } from "@/app/api/delivery-zones/route"

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
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u3",
  warehouseId: "wh_1",
}
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

function ctx(id = "z_1") {
  return { params: Promise.resolve({ id }) }
}

// ---------------------------------------------------------------------------
// Public: GET /api/delivery-zones
// ---------------------------------------------------------------------------

describe("GET /api/delivery-zones", () => {
  it("401 when unauthenticated", async () => {
    const res = await listActiveZones()
    expect(res.status).toBe(401)
  })

  it("returns active zones for any signed-in role", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "z_1", name: "Dhaka" }])
    const res = await listActiveZones()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Admin: GET /api/admin/delivery-zones
// ---------------------------------------------------------------------------

describe("GET /api/admin/delivery-zones", () => {
  it("401 when unauthenticated", async () => {
    const res = await listAdminZones()
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await listAdminZones()
    expect(res.status).toBe(403)
  })

  it("returns zones for super admin", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "z_1", name: "Dhaka", isActive: true }])
    const res = await listAdminZones()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
  })

  it("returns zones for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ id: "z_1", name: "Dhaka", isActive: true }])
    const res = await listAdminZones()
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Admin: POST /api/admin/delivery-zones
// ---------------------------------------------------------------------------

describe("POST /api/admin/delivery-zones", () => {
  it("401 when unauthenticated", async () => {
    const res = await createZone(req("POST", { name: "Chattogram" }))
    expect(res.status).toBe(401)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await createZone(req("POST", { name: "Chattogram" }))
    expect(res.status).toBe(403)
  })

  it("400 when name is empty", async () => {
    sessionState.value = superAdmin
    const res = await createZone(req("POST", { name: "" }))
    expect(res.status).toBe(400)
  })

  it("creates zone for super admin", async () => {
    sessionState.value = superAdmin
    insertResult.push({ id: "z_new", name: "Chattogram" })
    const res = await createZone(req("POST", { name: "Chattogram" }))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "z_new" })
  })
})

// ---------------------------------------------------------------------------
// Admin: PATCH /api/admin/delivery-zones/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/delivery-zones/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateZone(req("PATCH", { isActive: false }), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await updateZone(req("PATCH", { isActive: false }), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when zone not found", async () => {
    sessionState.value = superAdmin
    updateResult.push(undefined)
    const res = await updateZone(req("PATCH", { isActive: false }), ctx())
    expect(res.status).toBe(404)
  })

  it("updates zone", async () => {
    sessionState.value = superAdmin
    updateResult.push({ id: "z_1", name: "Dhaka", isActive: false })
    const res = await updateZone(req("PATCH", { isActive: false }), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.isActive).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Admin: DELETE /api/admin/delivery-zones/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/delivery-zones/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await deleteZone(req("DELETE"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await deleteZone(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("soft-deletes zone", async () => {
    sessionState.value = superAdmin
    updateResult.push({ id: "z_1", isActive: false })
    const res = await deleteZone(req("DELETE"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })
})
