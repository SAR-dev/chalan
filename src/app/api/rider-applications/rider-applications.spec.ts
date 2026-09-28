import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as approveApplication } from "./[id]/approve/route"
import { PATCH as rejectApplication } from "./[id]/reject/route"
import { GET as listApplications, POST as submitApplication } from "./route"

// --- Mocks -----------------------------------------------------------------

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: () => Promise.resolve(),
}))

vi.mock("@/lib/mailer", () => ({
  sendMail: () => Promise.resolve(),
  toPlainText: (html: string) => html.replace(/<[^>]+>/g, ""),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => null,
  rateLimitByIp: () => null,
  getClientIp: () => "127.0.0.1",
}))

const createUserResult: { user: { id: string } } = {
  user: { id: "auth_new_user" },
}

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createUser: () => Promise.resolve(createUserResult),
    },
  },
}))

const selectQueue: unknown[][] = []
const insertResult: unknown[] = []
const insertPayloads: Record<string, unknown>[] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
/** User ids passed to `DELETE FROM user` (orphan cleanup after a failure). */
const deletedUserIds: string[] = []
/** Set to make the next `db.transaction` reject (e.g. a unique violation). */
let transactionError: Error | null = null

/** Pulls the bound value out of a drizzle `eq(column, value)` clause. */
function extractParamValue(clause: unknown): string {
  const chunks = (clause as { queryChunks?: unknown[] })?.queryChunks ?? []
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown })?.value
    if (typeof value === "string") return value
  }
  return "?"
}

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      leftJoin: () => chain,
      $dynamic: () => chain,
      for: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
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
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => ({
      where: (clause: unknown) => {
        deletedUserIds.push(extractParamValue(clause))
        return Promise.resolve([])
      },
    }),
    transaction: (fn: (tx: unknown) => unknown) => {
      if (transactionError) {
        const err = transactionError
        transactionError = null
        return Promise.reject(err)
      }
      return Promise.resolve(fn(db))
    },
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  insertResult.length = 0
  insertPayloads.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  deletedUserIds.length = 0
  transactionError = null
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

function ctx(id = "app_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "WH Walt",
  userId: "u3",
  warehouseId: "wh_1",
}

const validApplication = {
  name: "Test Rider",
  email: "rider@test.com",
  phone: "01712345678",
  zone: "Dhaka",
  address: "123 Main St",
  warehouseId: "wh_1",
  nidNumber: "1234567890123",
  password: "password123",
}

// --- Tests -----------------------------------------------------------------

describe("POST /api/rider-applications", () => {
  it("returns 201 on valid application", async () => {
    selectQueue.push([{ id: "wh_1" }]) // warehouse found
    selectQueue.push([]) // no duplicate email
    insertResult.push({ id: "r_new", name: "Test Rider" })
    insertResult.push({ id: "profile_new" })
    const res = await submitApplication(
      req("POST", undefined, validApplication),
    )
    expect(res.status).toBe(201)
  })

  it("returns 400 on invalid body", async () => {
    const res = await submitApplication(req("POST", undefined, {}))
    expect(res.status).toBe(400)
  })

  it("returns 400 when warehouse not found", async () => {
    selectQueue.push([]) // warehouse not found
    const res = await submitApplication(
      req("POST", undefined, validApplication),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on duplicate email", async () => {
    selectQueue.push([{ id: "wh_1" }]) // warehouse exists
    selectQueue.push([{ id: "existing_rider" }]) // duplicate email
    const res = await submitApplication(
      req("POST", undefined, validApplication),
    )
    expect(res.status).toBe(400)
  })

  it("stores the rider and its profile in one transaction", async () => {
    selectQueue.push([{ id: "wh_1" }])
    selectQueue.push([])
    insertResult.push({ id: "r_new" }, { id: "profile_new" })
    const res = await submitApplication(
      req("POST", undefined, validApplication),
    )
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      email: "rider@test.com",
      status: "PENDING",
      isActive: false,
    })
    expect(insertPayloads[1]).toMatchObject({
      userId: "auth_new_user",
      riderId: "r_new",
    })
  })

  it("returns 400 and removes the auth user when the unique index rejects a duplicate email", async () => {
    // P1.1: the pre-check above can pass for two simultaneous applications;
    // `rider_email_uniq` is what actually stops the second one.
    selectQueue.push([{ id: "wh_1" }])
    selectQueue.push([])
    transactionError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    })
    const res = await submitApplication(
      req("POST", undefined, validApplication),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: "An application with this email already exists.",
    })
    expect(deletedUserIds).toEqual(["auth_new_user"])
  })

  it("returns 500 and removes the auth user when the write fails", async () => {
    selectQueue.push([{ id: "wh_1" }])
    selectQueue.push([])
    transactionError = new Error("boom")
    const res = await submitApplication(
      req("POST", undefined, validApplication),
    )
    expect(res.status).toBe(500)
    // No orphan: the user created for this application is gone.
    expect(deletedUserIds).toEqual(["auth_new_user"])
  })
})

describe("GET /api/rider-applications", () => {
  it("401 when unauthenticated", async () => {
    const res = await listApplications(req("GET"))
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    sessionState.value = warehouseAdmin
    const res = await listApplications(req("GET"))
    expect(res.status).toBe(403)
  })

  it("returns paginated applications for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 1 }])
    selectQueue.push([
      {
        id: "r1",
        name: "Rider One",
        status: "PENDING",
        warehouseName: "Main WH",
      },
    ])
    const res = await listApplications(
      req("GET", "http://test.local/api?limit=10&offset=0"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ total: 1, limit: 10, offset: 0 })
    expect(json.data).toHaveLength(1)
  })

  it("supports status filter", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 0 }])
    selectQueue.push([])
    const res = await listApplications(
      req("GET", "http://test.local/api?statuses=PENDING"),
    )
    expect(res.status).toBe(200)
  })
})

describe("PATCH /api/rider-applications/:id/approve", () => {
  it("401 when unauthenticated", async () => {
    const res = await approveApplication(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    sessionState.value = warehouseAdmin
    const res = await approveApplication(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when application not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await approveApplication(req("PATCH"), ctx())
    expect(res.status).toBe(404)
  })

  it("400 when application is not PENDING", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "ACTIVE", email: "r@test.com", name: "R" }])
    const res = await approveApplication(req("PATCH"), ctx())
    expect(res.status).toBe(400)
  })

  it("approves a PENDING application", async () => {
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", email: "r@test.com", name: "Rider" },
    ])
    updateResult.push({
      id: "app_1",
      status: "ACTIVE",
      isActive: true,
      approvedBy: "Admin Amy",
    })
    const res = await approveApplication(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "ACTIVE", isActive: true })
  })

  it("approves with warehouse override", async () => {
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", email: "r@test.com", name: "Rider" },
    ])
    updateResult.push({
      id: "app_1",
      status: "ACTIVE",
      isActive: true,
      warehouseId: "wh_new",
    })
    const res = await approveApplication(
      req("PATCH", undefined, { warehouseId: "wh_new" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ warehouseId: "wh_new" })
    expect(updatePayloads[0]).toMatchObject({ warehouseId: "wh_new" })
  })

  it("approves without warehouse override keeps original", async () => {
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", email: "r@test.com", name: "Rider" },
    ])
    updateResult.push({
      id: "app_1",
      status: "ACTIVE",
      isActive: true,
    })
    const res = await approveApplication(req("PATCH"), ctx())
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).not.toHaveProperty("warehouseId")
  })
})

describe("PATCH /api/rider-applications/:id/reject", () => {
  it("401 when unauthenticated", async () => {
    const res = await rejectApplication(
      req("PATCH", undefined, { reason: "No" }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    sessionState.value = warehouseAdmin
    const res = await rejectApplication(
      req("PATCH", undefined, { reason: "No" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("404 when application not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await rejectApplication(
      req("PATCH", undefined, { reason: "No" }),
      ctx(),
    )
    expect(res.status).toBe(404)
  })

  it("400 when application is not PENDING", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "ACTIVE", email: "r@test.com", name: "R" }])
    const res = await rejectApplication(
      req("PATCH", undefined, { reason: "No" }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("rejects a PENDING application with reason", async () => {
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", email: "r@test.com", name: "Rider" },
    ])
    updateResult.push({
      id: "app_1",
      status: "REJECTED",
      rejectionReason: "Not qualified",
    })
    const res = await rejectApplication(
      req("PATCH", undefined, { reason: "Not qualified" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Not qualified",
    })
  })

  it("400 when reason is missing", async () => {
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", email: "r@test.com", name: "Rider" },
    ])
    const res = await rejectApplication(req("PATCH", undefined, {}), ctx())
    expect(res.status).toBe(400)
  })
})
