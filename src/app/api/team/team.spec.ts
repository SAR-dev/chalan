import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as toggleActive } from "./[id]/active/route"
import { POST as resendActivation } from "./[id]/resend-activation/route"
import { PATCH as assignWarehouse } from "./[id]/warehouse/route"
import { POST as createTeam, GET as listTeam } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

// The lost-update guard is a SQL predicate, so assert on the SQL it renders
// rather than on the mock (which discards WHERE entirely).
const dialect = new PgDialect()
const renderUpdateWhere = (clause: unknown) =>
  dialect.sqlToQuery(clause as Parameters<PgDialect["sqlToQuery"]>[0])

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
  logAuditMany: vi.fn(() => Promise.resolve()),
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

const activationState = vi.hoisted(() => ({
  issueActivationToken: vi.fn(async () => "raw-token"),
  sendActivationEmail: vi.fn(async () => {}),
}))

const mailConfigState = vi.hoisted(() => ({
  hasActiveMailConfig: vi.fn(async () => true),
}))

vi.mock("@/lib/mail-config", () => ({
  hasActiveMailConfig: mailConfigState.hasActiveMailConfig,
  MAIL_NOT_CONFIGURED_MESSAGE: "Mail server is not set up yet.",
}))

vi.mock("@/lib/activation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activation")>()),
  issueActivationToken: activationState.issueActivationToken,
  sendActivationEmail: activationState.sendActivationEmail,
}))

vi.mock("@/lib/email-outbox", () => ({
  enqueueEmail: vi.fn(async () => {}),
  flushEmailOutbox: vi.fn(async () => {}),
  drainEmailOutbox: vi.fn(async () => ({
    claimed: 0,
    sent: 0,
    failed: 0,
  })),
}))

const selectQueue: unknown[][] = []
const insertPayloads: Record<string, unknown>[] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []
/**
 * WHERE clauses passed to `db.update()`, in call order.
 *
 * Recording them matters: the mock ignores the clause entirely, so a test that
 * only checks the response would still pass if the lost-update guard were
 * deleted. Rendering the recorded clause to SQL is what proves the write is
 * Actually conditional.
 */
const updateWhereClauses: unknown[] = []

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
      values: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload)
        return chain
      },
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => ({ where: () => Promise.resolve([]) }),
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  insertPayloads.length = 0
  updateWhereClauses.length = 0
  sessionState.value = null
  activationState.issueActivationToken.mockClear()
  activationState.sendActivationEmail.mockClear()
  mailConfigState.hasActiveMailConfig.mockReset()
  mailConfigState.hasActiveMailConfig.mockResolvedValue(true)
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

  it("maps lifecycle status (pending invite)", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ count: 1 }],
      [
        {
          profile: {
            role: "WAREHOUSE_ADMIN",
            userId: "u1",
            isActive: false,
            activatedAt: null,
          },
          user: { id: "u1", name: "Pending Pat" },
        },
      ],
    )
    const res = await listTeam(req("GET", "http://test.local/api?limit=10"))
    const json = await res.json()
    expect(json.data[0].status).toBe("PENDING")
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

  it("creates a PENDING team member and emails the activation link", async () => {
    sessionState.value = superAdmin
    insertResult.push({
      id: "p_new",
      userId: "auth_user_id",
      role: "WAREHOUSE_ADMIN",
      phone: "01712345678",
      isActive: false,
      activatedAt: null,
    })
    selectQueue.push([
      {
        id: "p_new",
        role: "WAREHOUSE_ADMIN",
        phone: "01712345678",
        isActive: false,
        activatedAt: null,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await createTeam(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "auth_user_id", status: "PENDING" })
    expect(insertPayloads[0]).toMatchObject({
      role: "WAREHOUSE_ADMIN",
      isActive: false,
    })
    expect(activationState.issueActivationToken).toHaveBeenCalledWith(
      "auth_user_id",
      // Token is issued inside the creation transaction.
      expect.anything(),
    )
    expect(activationState.sendActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@test.com",
        rawToken: "raw-token",
      }),
      // Enqueued inside the creation transaction.
      expect.anything(),
    )
  })
})

describe("POST /api/team/:id/resend-activation", () => {
  it("401 when unauthenticated", async () => {
    const res = await resendActivation(req("POST"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await resendActivation(req("POST"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when the member is unknown", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await resendActivation(req("POST"), ctx())
    expect(res.status).toBe(404)
  })

  it("400 when already activated", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      {
        activatedAt: "2026-01-01T00:00:00.000Z",
        name: "Amy",
        email: "amy@test.com",
      },
    ])
    const res = await resendActivation(req("POST"), ctx())
    expect(res.status).toBe(400)
  })

  it("400 when no active mail config exists", async () => {
    sessionState.value = superAdmin
    mailConfigState.hasActiveMailConfig.mockResolvedValue(false)
    selectQueue.push([
      { activatedAt: null, name: "Pat", email: "pat@test.com" },
    ])
    const res = await resendActivation(req("POST"), ctx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Mail server is not set up")
    expect(activationState.issueActivationToken).not.toHaveBeenCalled()
  })

  it("issues a fresh token and emails it when pending", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      { activatedAt: null, name: "Pat", email: "pat@test.com" },
    ])
    const res = await resendActivation(req("POST"), ctx())
    expect(res.status).toBe(200)
    expect(activationState.issueActivationToken).toHaveBeenCalledWith(
      "user_1",
      // Token re-issued inside the resend transaction.
      expect.anything(),
    )
    expect(activationState.sendActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pat@test.com", rawToken: "raw-token" }),
      expect.anything(),
    )
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

  // The whole point of the fix: the write must be conditional on the state we
  // read. Asserted on rendered SQL because the mock throws WHERE away — a test
  // that only looked at the response would still pass with the guard deleted.
  it("makes the flip a conditional write, not a blind overwrite", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ isActive: true }], [{ name: "Amy" }])
    updateResult.push({ isActive: false })
    const res = await toggleActive(req("PATCH"), ctx())
    expect(res.status).toBe(200)

    expect(updateWhereClauses).toHaveLength(1)
    const { sql, params } = renderUpdateWhere(updateWhereClauses[0])
    // Identity match …
    expect(sql).toContain('"profile"."userId" =')
    // … plus the state we read, which is what makes it compare-and-swap.
    expect(sql).toContain('"profile"."isActive" =')
    expect(params).toContain(true)
    expect(params).toContain("user_1")
  })

  // A concurrent request flipped the account between our read and our write,
  // so the CAS matched nothing. Reporting success would claim a change that
  // never happened and would hide the other request's write.
  it("409s instead of reporting success when the row moved underneath it", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ isActive: true }])
    // updateResult stays empty — UPDATE … RETURNING matched no rows.
    const res = await toggleActive(req("PATCH"), ctx())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/reload and try again/i)
    // A conflict must not be audited as though the toggle happened.
    expect(logAudit).not.toHaveBeenCalled()
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
