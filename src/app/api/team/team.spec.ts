import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as toggleActive } from "./[id]/active/route"
import { PATCH as assignWarehouse } from "./[id]/warehouse/route"
import { POST as createTeam, GET as listTeam } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createUser: () =>
        Promise.resolve({
          user: {
            id: "auth_user_id",
            name: "New Admin",
            email: "a@b.com",
            emailVerified: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
    },
  },
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
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

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  sessionState.value = null
  vi.mocked(logAudit).mockClear()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "user_1") {
  return { params: Promise.resolve({ id }) }
}

const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u1" }
const admin = { role: "WAREHOUSE_ADMIN", name: "Admin Amy", userId: "u2" }

describe("GET /api/team", () => {
  it("401 when unauthenticated", async () => {
    const res = await listTeam(req("GET"))
    expect(res.status).toBe(401)
  })

  it("non-super-admin returns empty", async () => {
    sessionState.value = admin
    const res = await listTeam(req("GET"))
    const json = await res.json()
    expect(json).toMatchObject({ data: [], total: 0 })
  })

  it("returns paginated team for super admin", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ count: 1 }],
      [
        {
          profile: { role: "SUPER_ADMIN", userId: "u1" },
          user: { id: "u1", name: "Amy" },
        },
      ],
    )
    const res = await listTeam(req("GET", "http://test.local/api?limit=10"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })
})

describe("POST /api/team", () => {
  const validBody = {
    name: "New Admin",
    email: "new@test.com",
    phone: "01712345678",
    role: "WAREHOUSE_ADMIN",
    password: "Secret123!",
  }

  it("401 when unauthenticated", async () => {
    const res = await createTeam(req("POST", undefined, validBody))
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await createTeam(req("POST", undefined, validBody))
    expect(res.status).toBe(403)
  })

  it("creates team member", async () => {
    sessionState.value = superAdmin
    insertResult.push({
      id: "p_new",
      userId: "auth_user_id",
      role: "WAREHOUSE_ADMIN",
      phone: "01712345678",
      isActive: true,
    })
    selectQueue.push([
      {
        id: "p_new",
        role: "WAREHOUSE_ADMIN",
        phone: "01712345678",
        isActive: true,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await createTeam(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "auth_user_id" })
  })
})

describe("PATCH /api/team/:id/active", () => {
  it("401 when unauthenticated", async () => {
    const res = await toggleActive(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await toggleActive(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await toggleActive(req("PATCH"), ctx())
    expect(res.status).toBe(404)
  })

  it("toggles active status", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ isActive: true }], [{ name: "Amy" }])
    updateResult.push({ isActive: false })
    const res = await toggleActive(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.isActive).toBe(false)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEAM_MEMBER_DEACTIVATED",
        metadata: {
          diff: { isActive: { from: true, to: false } },
        },
      }),
    )
  })
})

describe("PATCH /api/team/:id/warehouse", () => {
  it("401 when unauthenticated", async () => {
    const res = await assignWarehouse(
      req("PATCH", undefined, { warehouseId: "wh_1" }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await assignWarehouse(
      req("PATCH", undefined, { warehouseId: "wh_1" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("400 for non-warehouse-admin", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ role: "SUPER_ADMIN" }])
    const res = await assignWarehouse(
      req("PATCH", undefined, { warehouseId: "wh_1" }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("assigns warehouse", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ role: "WAREHOUSE_ADMIN" }],
      [{ name: "WH Walt" }],
      [{ name: "WH One" }],
    )
    updateResult.push({ warehouseId: "wh_1" })
    const res = await assignWarehouse(
      req("PATCH", undefined, { warehouseId: "wh_1" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toBeDefined()
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEAM_MEMBER_WAREHOUSE_REASSIGNED",
        metadata: {
          diff: { warehouseId: { from: null, to: "wh_1" } },
        },
      }),
    )
  })
})
