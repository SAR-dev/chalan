import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as patchSupport } from "./[id]/route"
import { POST as createSupport, GET as listSupport } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }
let rateLimited = false

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => (rateLimited ? ({ status: 429 } as Response) : null),
  rateLimitByIp: () => (rateLimited ? ({ status: 429 } as Response) : null),
  getClientIp: () => "127.0.0.1",
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
  const tx = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  sessionState.value = null
  rateLimited = false
  vi.mocked(logAudit).mockClear()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api/support", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "sup_1") {
  return { params: Promise.resolve({ id }) }
}

const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u1" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const warehouseSession = {
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

describe("GET /api/support", () => {
  it("401 when unauthenticated", async () => {
    const res = await listSupport(req("GET"))
    expect(res.status).toBe(401)
  })

  it("merchant sees only their own tickets", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ count: 1 }], [{ id: "sup_1", userId: "u2" }])
    const res = await listSupport(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
    expect(json.data).toHaveLength(1)
  })

  it("rider sees only their own tickets", async () => {
    sessionState.value = riderSession
    selectQueue.push([{ count: 1 }], [{ id: "sup_2", userId: "u4" }])
    const res = await listSupport(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("super admin sees all tickets", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ count: 2 }],
      [
        { id: "sup_1", userId: "u2" },
        { id: "sup_3", userId: "u3" },
      ],
    )
    const res = await listSupport(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
    expect(json.data).toHaveLength(2)
  })

  it("drops unknown statuses from the filter", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ count: 0 }], [])
    const res = await listSupport(
      req("GET", "http://test.local/api/support?status=OPEN,BOGUS"),
    )
    expect(res.status).toBe(200)
  })
})

describe("POST /api/support", () => {
  const validBody = {
    subject: "Payout missing for ORD-100042",
    message: "My payout for last week has not arrived yet, please check.",
  }

  it("401 when unauthenticated", async () => {
    const res = await createSupport(req("POST", undefined, validBody))
    expect(res.status).toBe(401)
  })

  it("400 with issues on invalid body", async () => {
    sessionState.value = merchantSession
    const res = await createSupport(
      req("POST", undefined, { subject: "ab", message: "too short" }),
    )
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(Array.isArray(json.issues)).toBe(true)
    expect(json.issues.length).toBeGreaterThan(0)
  })

  it("creates a ticket for any authenticated role", async () => {
    sessionState.value = merchantSession
    insertResult.push({
      id: "sup_new",
      userId: "u2",
      actorName: "Merchant Moe",
      actorRole: "MERCHANT",
      subject: validBody.subject,
      message: validBody.message,
      status: "OPEN",
    })
    const res = await createSupport(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({
      id: "sup_new",
      status: "OPEN",
      actorName: "Merchant Moe",
      actorRole: "MERCHANT",
    })
  })

  it("429 when rate limited", async () => {
    sessionState.value = merchantSession
    rateLimited = true
    const res = await createSupport(req("POST", undefined, validBody))
    expect(res.status).toBe(429)
  })
})

describe("PATCH /api/support/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await patchSupport(req("PATCH", undefined, {}), ctx())
    expect(res.status).toBe(401)
  })

  it("400 when neither a reply nor a close is provided", async () => {
    sessionState.value = superAdmin
    const res = await patchSupport(req("PATCH", undefined, {}), ctx())
    expect(res.status).toBe(400)
  })

  it("404 when the ticket does not exist", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await patchSupport(
      req("PATCH", undefined, { adminReply: "On it." }),
      ctx(),
    )
    expect(res.status).toBe(404)
  })

  it("403 when a non-admin tries to reply", async () => {
    sessionState.value = merchantSession
    selectQueue.push([
      { id: "sup_1", userId: "u2", subject: "Help", status: "OPEN" },
    ])
    const res = await patchSupport(
      req("PATCH", undefined, { adminReply: "Let me reply as a merchant." }),
      ctx(),
    )
    expect(res.status).toBe(403)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("403 when closing someone else's ticket", async () => {
    sessionState.value = merchantSession
    selectQueue.push([
      { id: "sup_1", userId: "u9", subject: "Help", status: "OPEN" },
    ])
    const res = await patchSupport(
      req("PATCH", undefined, { status: "CLOSED" }),
      ctx(),
    )
    expect(res.status).toBe(403)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("admin reply sets ANSWERED and writes an audit entry", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      { id: "sup_1", userId: "u2", subject: "Payout missing", status: "OPEN" },
    ])
    updateResult.push({
      id: "sup_1",
      userId: "u2",
      subject: "Payout missing",
      status: "ANSWERED",
      adminReply: "Paid out today.",
      repliedBy: "Super",
      repliedAt: "2026-09-25T00:00:00.000Z",
    })
    const res = await patchSupport(
      req("PATCH", undefined, { adminReply: "Paid out today." }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "ANSWERED" })
    expect(updatePayloads.at(-1)).toMatchObject({
      adminReply: "Paid out today.",
      repliedBy: "Super",
      status: "ANSWERED",
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUPPORT_REPLIED",
        entityType: "support_ticket",
        entityId: "sup_1",
      }),
    )
  })

  it("admin close sets CLOSED and writes an audit entry", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      {
        id: "sup_1",
        userId: "u2",
        subject: "Payout missing",
        status: "ANSWERED",
      },
    ])
    updateResult.push({
      id: "sup_1",
      userId: "u2",
      subject: "Payout missing",
      status: "CLOSED",
    })
    const res = await patchSupport(
      req("PATCH", undefined, { status: "CLOSED" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "CLOSED" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUPPORT_CLOSED",
        entityType: "support_ticket",
      }),
    )
  })

  it("owner can close their own ticket without an audit entry", async () => {
    sessionState.value = riderSession
    selectQueue.push([
      { id: "sup_4", userId: "u4", subject: "App crash", status: "OPEN" },
    ])
    updateResult.push({
      id: "sup_4",
      userId: "u4",
      subject: "App crash",
      status: "CLOSED",
    })
    const res = await patchSupport(
      req("PATCH", undefined, { status: "CLOSED" }),
      ctx("sup_4"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "CLOSED" })
    expect(updatePayloads.at(-1)).toMatchObject({ status: "CLOSED" })
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("403 when a warehouse admin closes a ticket they do not own", async () => {
    sessionState.value = warehouseSession
    selectQueue.push([
      { id: "sup_9", userId: "u2", subject: "Not mine", status: "OPEN" },
    ])
    const res = await patchSupport(
      req("PATCH", undefined, { status: "CLOSED" }),
      ctx("sup_9"),
    )
    expect(res.status).toBe(403)
  })
})
