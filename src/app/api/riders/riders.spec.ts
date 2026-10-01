import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as toggleRiderActive } from "./[id]/active/route"
import { GET as getRiderCash } from "./[id]/cash/route"
import { GET as getRider, PATCH as updateRider } from "./[id]/route"
import { GET as listRiderCash } from "./cash/route"
import { GET as listRiders } from "./route"

// --- Mocks -----------------------------------------------------------------

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createUser: () => Promise.resolve({ user: { id: "auth_user_id" } }),
    },
  },
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
/**
 * WHERE clauses passed to `db.update()`, in call order. The mock discards them,
 * so rendering the recorded clause to SQL is the only way to prove the toggle's
 * lost-update guard is really in the query (ROADMAP R0.9).
 */
const updateWhereClauses: unknown[] = []

// The guard is a SQL predicate — assert on the SQL it renders.
const dialect = new PgDialect()
const renderUpdateWhere = (clause: unknown) =>
  dialect.sqlToQuery(clause as Parameters<PgDialect["sqlToQuery"]>[0])

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
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
      where: (clause?: unknown) => {
        updateWhereClauses.push(clause)
        return chain
      },
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
  updatePayloads.length = 0
  updateWhereClauses.length = 0
  sessionState.value = null
})

// --- Helpers ---------------------------------------------------------------

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "rider_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const _superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u2" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u3",
  warehouseId: "wh_1",
}
const riderSession = {
  role: "RIDER",
  name: "Rider Rick",
  userId: "u4",
  riderId: "rider_1",
}

// --- Tests -----------------------------------------------------------------

describe("GET /api/riders", () => {
  it("401 when unauthenticated", async () => {
    const res = await listRiders(req("GET"))
    expect(res.status).toBe(401)
  })

  it("returns paginated riders for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 1 }], [{ id: "r1", name: "Rider One" }])
    const res = await listRiders(
      req("GET", "http://test.local/api?limit=10&offset=0"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ total: 1, limit: 10, offset: 0 })
    expect(json.data).toHaveLength(1)
  })

  it("warehouse admin is scoped to their own warehouse", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ count: 2 }], [{ id: "r1" }, { id: "r2" }])
    const res = await listRiders(req("GET", "http://test.local/api"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
  })

  it("warehouse admin without warehouseId returns empty", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH",
      warehouseId: null,
    }
    const res = await listRiders(req("GET"))
    const json = await res.json()
    expect(json).toEqual({
      data: [],
      total: 0,
      limit: undefined,
      offset: undefined,
    })
  })
})

describe("GET /api/riders/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await getRider(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await getRider(req("GET"), ctx())
    expect(res.status).toBe(404)
  })

  it("returns rider for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "rider_1", name: "Rider One" }])
    const res = await getRider(req("GET"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "rider_1" })
  })

  it("rider can fetch their own record", async () => {
    sessionState.value = riderSession
    selectQueue.push([{ id: "rider_1", name: "Rider One" }])
    const res = await getRider(req("GET"), ctx("rider_1"))
    expect(res.status).toBe(200)
  })

  it("rider cannot fetch another rider's record", async () => {
    sessionState.value = riderSession
    selectQueue.push([{ id: "rider_2", name: "Other Rider" }])
    const res = await getRider(req("GET"), ctx("rider_2"))
    expect(res.status).toBe(403)
  })

  it("warehouse admin can fetch own warehouse rider", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([
      { id: "rider_1", name: "Rider One", warehouseId: "wh_1" },
    ])
    const res = await getRider(req("GET"), ctx("rider_1"))
    expect(res.status).toBe(200)
  })

  it("warehouse admin forbidden from fetching other warehouse rider", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([
      { id: "rider_2", name: "Other Rider", warehouseId: "wh_2" },
    ])
    const res = await getRider(req("GET"), ctx("rider_2"))
    expect(res.status).toBe(403)
  })
})

describe("PATCH /api/riders/:id", () => {
  const validBody = { name: "Updated Name", phone: "01712345678" }

  it("401 when unauthenticated", async () => {
    const res = await updateRider(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for rider role", async () => {
    sessionState.value = riderSession
    const res = await updateRider(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when rider not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await updateRider(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(404)
  })

  it("admin can update rider details", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "rider_1", name: "Old Name", warehouseId: "wh_1" }])
    updateResult.push({ id: "rider_1", name: "Updated Name" })
    const res = await updateRider(req("PATCH", undefined, validBody), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toBeDefined()
  })

  it("warehouse admin can update own warehouse rider", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ id: "rider_1", name: "Old", warehouseId: "wh_1" }])
    updateResult.push({ id: "rider_1", name: "Updated" })
    const res = await updateRider(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(200)
  })

  it("warehouse admin forbidden from updating other warehouse rider", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ id: "rider_1", name: "Old", warehouseId: "wh_2" }])
    const res = await updateRider(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(403)
  })
})

describe("PATCH /api/riders/:id/active", () => {
  it("401 when unauthenticated", async () => {
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for rider role", async () => {
    sessionState.value = riderSession
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when rider not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(404)
  })

  it("admin toggles rider active status", async () => {
    sessionState.value = admin
    selectQueue.push([{ isActive: true, warehouseId: "wh_1" }])
    updateResult.push({ id: "rider_1", name: "Rider", isActive: false })
    const res = await toggleRiderActive(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.isActive).toBe(false)
  })

  it("warehouse admin can toggle own warehouse rider", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ isActive: false, warehouseId: "wh_1" }])
    updateResult.push([{ id: "rider_1", name: "Rider", isActive: true }])
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(200)
  })

  it("warehouse admin forbidden from toggling other warehouse rider", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ isActive: true, warehouseId: "wh_2" }])
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  // The write must be conditional on the state we read; otherwise two
  // concurrent toggles write the same value and one activation is silently
  // lost. Asserted on rendered SQL because the mock discards WHERE.
  it("makes the flip a conditional write, not a blind overwrite", async () => {
    sessionState.value = admin
    selectQueue.push([{ isActive: true, warehouseId: "wh_1" }])
    updateResult.push({ id: "rider_1", name: "Rider", isActive: false })
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(200)

    expect(updateWhereClauses).toHaveLength(1)
    const { sql, params } = renderUpdateWhere(updateWhereClauses[0])
    expect(sql).toContain('"rider"."id" =')
    expect(sql).toContain('"rider"."isActive" =')
    expect(params).toContain("rider_1")
    expect(params).toContain(true)
  })

  it("409s instead of reporting success when the row moved underneath it", async () => {
    sessionState.value = admin
    selectQueue.push([{ isActive: true, warehouseId: "wh_1" }])
    // updateResult stays empty — UPDATE … RETURNING matched no rows.
    const res = await toggleRiderActive(req("PATCH"), ctx())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/reload and try again/i)
  })
})

describe("GET /api/riders/cash", () => {
  it("401 when unauthenticated", async () => {
    const res = await listRiderCash()
    expect(res.status).toBe(401)
  })

  it("403 for riders", async () => {
    sessionState.value = riderSession
    const res = await listRiderCash()
    expect(res.status).toBe(403)
  })

  it("merchants get an empty list", async () => {
    sessionState.value = { role: "MERCHANT", name: "Moe", userId: "u5" }
    const res = await listRiderCash()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual([])
  })

  it("warehouse admin is scoped to their own riders", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([
      {
        riderId: "rider_1",
        riderName: "R1",
        totalCollected: 100,
        totalSubmitted: 40,
      },
    ])
    const res = await listRiderCash()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
    expect(json[0]).toMatchObject({ cashOnHand: 60 })
  })

  it("super admin sees the whole roster", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        riderId: "rider_1",
        riderName: "R1",
        totalCollected: 10,
        totalSubmitted: 10,
      },
      {
        riderId: "rider_2",
        riderName: "R2",
        totalCollected: 20,
        totalSubmitted: 0,
      },
    ])
    const res = await listRiderCash()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(2)
  })
})

describe("GET /api/riders/:id/cash", () => {
  it("401 when unauthenticated", async () => {
    const res = await getRiderCash(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("404 when rider not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await getRiderCash(req("GET"), ctx())
    expect(res.status).toBe(404)
  })

  it("403 for merchants", async () => {
    sessionState.value = { role: "MERCHANT", name: "Moe", userId: "u5" }
    selectQueue.push([{ id: "rider_1", warehouseId: "wh_1" }])
    const res = await getRiderCash(req("GET"), ctx("rider_1"))
    expect(res.status).toBe(403)
  })

  it("403 when a rider asks about someone else", async () => {
    sessionState.value = riderSession
    selectQueue.push([{ id: "rider_2", warehouseId: "wh_1" }])
    const res = await getRiderCash(req("GET"), ctx("rider_2"))
    expect(res.status).toBe(403)
  })

  it("403 for a warehouse admin outside their hub", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([{ id: "rider_2", warehouseId: "wh_2" }])
    const res = await getRiderCash(req("GET"), ctx("rider_2"))
    expect(res.status).toBe(403)
  })

  it("returns cash summary and transactions for own rider", async () => {
    sessionState.value = riderSession
    selectQueue.push(
      [{ id: "rider_1", name: "R1", warehouseId: "wh_1" }],
      [{ totalCollected: 100, totalSubmitted: 40 }],
      [{ orderId: "o1", amountCollected: 100, createdAt: "2025-01-02" }],
      [{ orderId: "o1", amountCollected: 40, confirmedAt: "2025-01-03" }],
    )
    const res = await getRiderCash(req("GET"), ctx("rider_1"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      riderId: "rider_1",
      cash: { totalCollected: 100, totalSubmitted: 40, cashOnHand: 60 },
    })
    expect(json.transactions).toHaveLength(2)
  })
})
