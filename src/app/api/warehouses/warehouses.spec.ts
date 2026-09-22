import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DELETE as deleteWarehouse,
  GET as getWarehouse,
  PATCH as updateWarehouse,
} from "./[id]/route"
import { GET as listPublicWarehouses } from "./public/route"
import { POST as createWarehouse, GET as listWarehouses } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const insertResult: unknown[] = []
const deleteResult: { ok: boolean } = { ok: false }

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const updateChain = {
    set: () => updateChain,
    where: () => updateChain,
    returning: () => Promise.resolve(updateResult),
  }
  const insertChain = {
    values: () => insertChain,
    returning: () => Promise.resolve(insertResult),
  }
  const deleteChain = {
    where: () => {
      deleteResult.ok = true
      return Promise.resolve()
    },
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => insertChain,
    update: () => updateChain,
    delete: () => deleteChain,
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  insertResult.length = 0
  deleteResult.ok = false
  sessionState.value = null
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "wh_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u2" }
const whAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u3",
  warehouseId: "wh_1",
}

describe("GET /api/warehouses", () => {
  it("401 when unauthenticated", async () => {
    const res = await listWarehouses(req("GET"))
    expect(res.status).toBe(401)
  })

  it("returns paginated warehouses", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 1 }], [{ id: "wh_1", name: "WH One" }])
    const res = await listWarehouses(
      req("GET", "http://test.local/api?limit=10"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ total: 1 })
  })
})

describe("POST /api/warehouses", () => {
  const validBody = {
    name: "New WH",
    address: "Addr",
    city: "City",
  }

  it("401 when unauthenticated", async () => {
    const res = await createWarehouse(req("POST", undefined, validBody))
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH Admin",
      userId: "u_wh",
    }
    const res = await createWarehouse(req("POST", undefined, validBody))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body", async () => {
    sessionState.value = superAdmin
    const res = await createWarehouse(req("POST", undefined, {}))
    expect(res.status).toBe(400)
  })

  it("409 on duplicate name+city", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "existing" }])
    const res = await createWarehouse(req("POST", undefined, validBody))
    expect(res.status).toBe(409)
  })

  it("creates warehouse", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    insertResult.push({ id: "wh_new", name: "New WH" })
    const res = await createWarehouse(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "wh_new" })
  })
})

describe("GET /api/warehouses/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await getWarehouse(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for warehouse admin of different warehouse", async () => {
    sessionState.value = { ...whAdmin, warehouseId: "wh_2" }
    const res = await getWarehouse(req("GET"), ctx("wh_1"))
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await getWarehouse(req("GET"), ctx())
    expect(res.status).toBe(404)
  })

  it("returns warehouse for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "wh_1", name: "WH One" }])
    const res = await getWarehouse(req("GET"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "wh_1" })
  })

  it("returns warehouse for matching warehouse admin", async () => {
    sessionState.value = whAdmin
    selectQueue.push([{ id: "wh_1", name: "WH One" }])
    const res = await getWarehouse(req("GET"), ctx("wh_1"))
    expect(res.status).toBe(200)
  })
})

describe("PATCH /api/warehouses/:id", () => {
  const validBody = { name: "Updated WH", city: "New City" }

  it("401 when unauthenticated", async () => {
    const res = await updateWarehouse(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH Admin",
      userId: "u_wh",
    }
    const res = await updateWarehouse(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(403)
  })

  it("400 on invalid body", async () => {
    sessionState.value = superAdmin
    const res = await updateWarehouse(req("PATCH", undefined, {}), ctx())
    expect(res.status).toBe(400)
  })

  it("404 when warehouse not found", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await updateWarehouse(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(404)
  })

  it("409 on duplicate name+city", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ name: "Old", city: "OldCity" }], [{ id: "other" }])
    const res = await updateWarehouse(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(409)
  })

  it("updates warehouse", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ name: "Old", city: "OldCity" }], [])
    updateResult.push({ id: "wh_1", name: "Updated WH" })
    const res = await updateWarehouse(req("PATCH", undefined, validBody), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toBeDefined()
  })
})

describe("DELETE /api/warehouses/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await deleteWarehouse(req("DELETE"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH Admin",
      userId: "u_wh",
    }
    const res = await deleteWarehouse(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("409 when warehouse has references", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "ref" }])
    const res = await deleteWarehouse(req("DELETE"), ctx())
    expect(res.status).toBe(409)
  })

  it("deletes warehouse", async () => {
    sessionState.value = superAdmin
    selectQueue.push([], [], [], [{ name: "WH One" }])
    const res = await deleteWarehouse(req("DELETE"), ctx())
    expect(res.status).toBe(200)
  })
})

describe("GET /api/warehouses/public", () => {
  it("returns active warehouses without auth", async () => {
    selectQueue.push([
      { id: "wh_1", name: "WH One", city: "Dhaka" },
      { id: "wh_2", name: "WH Two", city: "Chittagong" },
    ])
    const res = await listPublicWarehouses()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(2)
    expect(json[0]).toMatchObject({ id: "wh_1", name: "WH One" })
  })

  it("returns empty array when no active warehouses", async () => {
    selectQueue.push([])
    const res = await listPublicWarehouses()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(0)
  })
})
