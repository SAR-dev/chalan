import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE as deleteZonePricing,
  PATCH as updateZonePricing,
} from "./[id]/route"
import { POST as createZonePricing, GET as listZonePricing } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []
const insertPayloads: Record<string, unknown>[] = []
const whereCalls: unknown[] = []
let deleteOutcome: unknown = { rowCount: 1 }

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: (clause?: unknown) => {
        whereCalls.push(clause)
        return chain
      },
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
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
      values: (vals: Record<string, unknown>) => {
        insertPayloads.push(vals)
        return chain
      },
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const makeDeleteChain = () => {
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(deleteOutcome),
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
  updatePayloads.length = 0
  insertResult.length = 0
  insertPayloads.length = 0
  whereCalls.length = 0
  deleteOutcome = { rowCount: 1 }
  sessionState.value = null
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api/admin/zone-pricing", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "zp_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "Warehouse Wendy",
  userId: "u2",
  warehouseId: "wh_1",
}
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u3",
  merchantId: "m_1",
}
const riderSession = {
  role: "RIDER",
  name: "Rider Rhea",
  userId: "u4",
  riderId: "r_1",
}

const validCreateBody = {
  fromZoneId: "z_dhaka",
  toZoneId: "z_chittagong",
  baseRate: 60,
  extraRatePerKg: 12,
  freeWeightKg: 1,
  maxWeightKg: 10,
  codFeePercentage: 2,
}

describe("GET /api/admin/zone-pricing", () => {
  it("401 when unauthenticated", async () => {
    const res = await listZonePricing(req("GET"))
    expect(res.status).toBe(401)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await listZonePricing(req("GET"))
    expect(res.status).toBe(403)
  })

  it("403 for rider", async () => {
    sessionState.value = riderSession
    const res = await listZonePricing(req("GET"))
    expect(res.status).toBe(403)
  })

  it("returns rows for super admin without filter", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "zp_1", fromZoneId: "z1", toZoneId: "z2" }])
    const res = await listZonePricing(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
    expect(whereCalls[0]).toBeUndefined()
  })

  it("returns rows for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ id: "zp_1" }, { id: "zp_2" }])
    const res = await listZonePricing(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(2)
  })

  it("filters by fromZoneId when provided", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "zp_1", fromZoneId: "z_dhaka" }])
    const res = await listZonePricing(
      req("GET", "http://test.local/api/admin/zone-pricing?fromZoneId=z_dhaka"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
    expect(whereCalls[0]).toBeDefined()
  })
})

describe("POST /api/admin/zone-pricing", () => {
  it("401 when unauthenticated", async () => {
    const res = await createZonePricing(req("POST", undefined, validCreateBody))
    expect(res.status).toBe(401)
  })

  it("403 for warehouse admin (SUPER_ADMIN only)", async () => {
    sessionState.value = warehouseAdmin
    const res = await createZonePricing(req("POST", undefined, validCreateBody))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body with issues", async () => {
    sessionState.value = admin
    const res = await createZonePricing(req("POST", undefined, {}))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("creates pricing row when pair does not exist", async () => {
    sessionState.value = admin
    selectQueue.push([])
    insertResult.push({ id: "zp_new", ...validCreateBody })
    const res = await createZonePricing(req("POST", undefined, validCreateBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "zp_new" })
    expect(insertPayloads[0]).toMatchObject({
      fromZoneId: "z_dhaka",
      toZoneId: "z_chittagong",
      baseRate: 60,
    })
  })

  it("updates existing row for same zone pair (upsert)", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "zp_1" }])
    updateResult.push({ id: "zp_1", baseRate: 75 })
    const res = await createZonePricing(
      req("POST", undefined, { ...validCreateBody, baseRate: 75 }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "zp_1", baseRate: 75 })
    expect(updatePayloads[0]).toMatchObject({ baseRate: 75 })
  })
})

describe("PATCH /api/admin/zone-pricing/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await updateZonePricing(
      req("PATCH", undefined, { baseRate: 70 }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await updateZonePricing(
      req("PATCH", undefined, { baseRate: 70 }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("400 on invalid body with issues", async () => {
    sessionState.value = admin
    const res = await updateZonePricing(
      req("PATCH", undefined, { baseRate: -1 }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("updates pricing row", async () => {
    sessionState.value = admin
    updateResult.push({ id: "zp_1", baseRate: 70 })
    const res = await updateZonePricing(
      req("PATCH", undefined, { baseRate: 70 }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "zp_1", baseRate: 70 })
    expect(updatePayloads[0]).toMatchObject({ baseRate: 70 })
  })

  it("404 when id unknown", async () => {
    sessionState.value = admin
    const res = await updateZonePricing(
      req("PATCH", undefined, { baseRate: 70 }),
      ctx("zp_missing"),
    )
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/admin/zone-pricing/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await deleteZonePricing(req("DELETE"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = merchantSession
    const res = await deleteZonePricing(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("deletes pricing row", async () => {
    sessionState.value = admin
    const res = await deleteZonePricing(req("DELETE"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
  })

  it("404 when delete affects nothing", async () => {
    sessionState.value = admin
    deleteOutcome = undefined
    const res = await deleteZonePricing(req("DELETE"), ctx("zp_missing"))
    expect(res.status).toBe(404)
  })
})
