import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { PATCH as approvePayout } from "./[id]/approve/route"
import { PATCH as markPayoutPaid } from "./[id]/paid/route"
import { PATCH as rejectPayout } from "./[id]/reject/route"
import { PATCH as bulkApprovePayout } from "./bulk/approve/route"
import { PATCH as bulkMarkPayoutPaid } from "./bulk/mark-paid/route"
import { PATCH as bulkRejectPayout } from "./bulk/reject/route"
import { POST as createPayout, GET as listPayouts } from "./route"

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
const insertPayloads: Record<string, unknown>[] = []

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
      values: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload)
        return chain
      },
      onConflictDoUpdate: () => chain,
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
  insertPayloads.length = 0
  sessionState.value = null
  rateLimited = false
  vi.mocked(logAudit).mockClear()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "pr_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "WAREHOUSE_ADMIN", name: "Admin Amy", userId: "u1" }
const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u2" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u3",
  merchantId: "m_1",
}

describe("GET /api/payouts", () => {
  it("401 when unauthenticated", async () => {
    const res = await listPayouts(req("GET"))
    expect(res.status).toBe(401)
  })

  it("merchant sees own payouts", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ count: 1 }], [{ id: "pr_1", merchantId: "m_1" }])
    const res = await listPayouts(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("non-super-admin non-merchant returns empty", async () => {
    sessionState.value = admin
    const res = await listPayouts(req("GET"))
    const json = await res.json()
    expect(json).toMatchObject({ data: [], total: 0 })
  })

  it("super admin sees all payouts", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ count: 2 }], [{ id: "pr_1" }, { id: "pr_2" }])
    const res = await listPayouts(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
  })
})

describe("POST /api/payouts", () => {
  const validBody = { payoutMethod: "bkash", payoutDetails: "01xxxx" }

  it("401 when unauthenticated", async () => {
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(401)
  })

  it("403 for non-merchant", async () => {
    sessionState.value = admin
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(403)
  })

  it("403 for a moderator without the Finance grant", async () => {
    sessionState.value = {
      ...merchantSession,
      isModerator: true,
      moderatorPermissions: ["/merchant/orders"],
    }
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("Finance")
  })

  it("lets a moderator holding the Finance grant through the nav gate", async () => {
    sessionState.value = {
      ...merchantSession,
      isModerator: true,
      moderatorPermissions: ["/merchant/finance"],
    }
    selectQueue.push([])
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(400)
  })

  it("400 when no payable orders", async () => {
    sessionState.value = merchantSession
    selectQueue.push([])
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(400)
  })

  it("creates payout request", async () => {
    sessionState.value = merchantSession
    selectQueue.push(
      [{ id: "o1", merchantEarnings: 89 }],
      [{ balance: -100 }], // merchant is in credit by 100 (ROADMAP B1)
    )
    insertResult.push({ id: "pr_new", status: "PENDING" })
    const res = await createPayout(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toBeDefined()
    // The request carries exactly the locked orders and their earnings total.
    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      orderIds: ["o1"],
      amount: 89,
      status: "PENDING",
    })
    // …and only those orders are linked.
    expect(updatePayloads[0]).toMatchObject({ payoutRequestId: "pr_new" })
  })

  it("caps the request at the available credit (ROADMAP B1)", async () => {
    sessionState.value = merchantSession
    selectQueue.push(
      [
        { id: "o1", merchantEarnings: 89 },
        { id: "o2", merchantEarnings: 30 }, // would push the total to 119
      ],
      [{ balance: -100 }], // only 100 of credit available
    )
    insertResult.push({ id: "pr_new", status: "PENDING" })
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({ orderIds: ["o1"], amount: 89 })
  })

  it("400 when the merchant owes (no available credit)", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "o1", merchantEarnings: 89 }], [{ balance: 60 }])
    const res = await createPayout(req("POST", undefined, validBody))
    expect(res.status).toBe(400)
  })
})

describe("PATCH /api/payouts/:id/approve", () => {
  it("401 when unauthenticated", async () => {
    const res = await approvePayout(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await approvePayout(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await approvePayout(req("PATCH"), ctx())
    expect(res.status).toBe(404)
  })

  it("approves payout", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ status: "PENDING", reviewedBy: null, reviewedAt: null }],
      [{ orderCount: 1, total: 89 }],
    )
    updateResult.push({
      id: "pr_1",
      status: "APPROVED",
      reviewedBy: "Super",
      reviewedAt: "2025-01-02T00:00:00Z",
    })
    const res = await approvePayout(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "APPROVED" })
    // The amount is recomputed from the linked orders.
    expect(updatePayloads[0]).toMatchObject({ status: "APPROVED", amount: 89 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYOUT_APPROVED",
        metadata: {
          diff: {
            status: { from: "PENDING", to: "APPROVED" },
            reviewedBy: { from: null, to: "Super" },
            reviewedAt: { from: null, to: "2025-01-02T00:00:00Z" },
          },
        },
      }),
    )
  })

  it("400 when the request has no linked orders", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ status: "PENDING" }], [{ orderCount: 0, total: 0 }])
    const res = await approvePayout(req("PATCH"), ctx())
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })
})

describe("PATCH /api/payouts/:id/paid", () => {
  it("401 when unauthenticated", async () => {
    const res = await markPayoutPaid(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await markPayoutPaid(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("marks payout as paid", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [
        {
          status: "APPROVED",
          paidAt: null,
          merchantId: "m_1",
          amount: 89,
        },
      ],
      [{ orderCount: 1, total: 89 }],
    )
    updateResult.push({
      id: "pr_1",
      status: "PAID",
      paidAt: "2025-01-03T00:00:00Z",
      amount: 89,
    })
    const res = await markPayoutPaid(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "PAID" })
    // Exactly one ledger row + one balance debit, using the recomputed amount.
    // A payout CONSUMES the merchant's credit, so it is positive in the debt
    // convention (positive = merchant owes) — see lib/balance-ledger.ts.
    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      type: "PAYOUT",
      amount: 89,
      status: "SETTLED",
    })
    expect(insertPayloads[1]).toMatchObject({ merchantId: "m_1", balance: 89 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYOUT_PAID",
        metadata: {
          diff: {
            status: { from: "APPROVED", to: "PAID" },
            paidAt: { from: null, to: "2025-01-03T00:00:00Z" },
          },
        },
      }),
    )
  })

  it("400 for an orphan request (amount but no linked orders)", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ status: "APPROVED", merchantId: "m_1", amount: 89 }],
      [{ orderCount: 0, total: 0 }],
    )
    const res = await markPayoutPaid(req("PATCH"), ctx())
    expect(res.status).toBe(400)
    expect(insertPayloads).toHaveLength(0)
    expect(updatePayloads).toHaveLength(0)
  })
})

describe("PATCH /api/payouts/:id/reject", () => {
  it("401 when unauthenticated", async () => {
    const res = await rejectPayout(
      req("PATCH", undefined, { reason: "Invalid" }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await rejectPayout(
      req("PATCH", undefined, { reason: "Invalid" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("rejects payout", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      { status: "PENDING", reviewedBy: null, reviewedAt: null },
    ])
    updateResult.push({
      id: "pr_1",
      status: "REJECTED",
      reviewedBy: "Super",
      reviewedAt: "2025-01-02T00:00:00Z",
      rejectReason: "Invalid details",
    })
    const res = await rejectPayout(
      req("PATCH", undefined, { reason: "Invalid details" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "REJECTED" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYOUT_REJECTED",
        metadata: {
          diff: {
            status: { from: "PENDING", to: "REJECTED" },
            reviewedBy: { from: null, to: "Super" },
            reviewedAt: { from: null, to: "2025-01-02T00:00:00Z" },
            rejectReason: { from: null, to: "Invalid details" },
          },
        },
      }),
    )
  })
})

describe("PATCH /api/payouts/bulk/approve", () => {
  it("401 when unauthenticated", async () => {
    const res = await bulkApprovePayout(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await bulkApprovePayout(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    expect(res.status).toBe(403)
  })

  it("400 when no pending requests match", async () => {
    sessionState.value = superAdmin
    selectQueue.push([])
    const res = await bulkApprovePayout(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    expect(res.status).toBe(400)
  })

  it("approves pending requests", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "pr_1" }, { id: "pr_2" }])
    updateResult.push({ id: "pr_1" }, { id: "pr_2" })
    const res = await bulkApprovePayout(
      req("PATCH", undefined, { ids: ["pr_1", "pr_2"] }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 2 })
    expect(logAudit).toHaveBeenCalledTimes(2)
  })
})

describe("PATCH /api/payouts/bulk/mark-paid", () => {
  it("401 when unauthenticated", async () => {
    const res = await bulkMarkPayoutPaid(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await bulkMarkPayoutPaid(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    expect(res.status).toBe(403)
  })

  it("marks approved requests as paid and writes the ledger", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ id: "pr_1" }],
      [{ status: "APPROVED", merchantId: "m_1", amount: 89 }],
      [{ orderCount: 1, total: 89 }],
    )
    updateResult.push({ id: "pr_1", status: "PAID", amount: 89 })
    const res = await bulkMarkPayoutPaid(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 1 })
    // The bulk path now settles exactly like the single one.
    expect(insertPayloads[0]).toMatchObject({ type: "PAYOUT", amount: 89 })
    expect(insertPayloads[1]).toMatchObject({ balance: 89 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYOUT_PAID",
        entityId: "pr_1",
      }),
    )
  })

  it("400 when nothing could be settled (all orphans)", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ id: "pr_1" }],
      [{ status: "APPROVED", merchantId: "m_1", amount: 89 }],
      [{ orderCount: 0, total: 0 }],
    )
    const res = await bulkMarkPayoutPaid(
      req("PATCH", undefined, { ids: ["pr_1"] }),
    )
    expect(res.status).toBe(400)
    expect(insertPayloads).toHaveLength(0)
  })
})

describe("PATCH /api/payouts/bulk/reject", () => {
  it("401 when unauthenticated", async () => {
    const res = await bulkRejectPayout(
      req("PATCH", undefined, { ids: ["pr_1"], reason: "Invalid" }),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = admin
    const res = await bulkRejectPayout(
      req("PATCH", undefined, { ids: ["pr_1"], reason: "Invalid" }),
    )
    expect(res.status).toBe(403)
  })

  it("rejects pending requests and clears their orders", async () => {
    sessionState.value = superAdmin
    selectQueue.push([{ id: "pr_1" }])
    updateResult.push({ id: "pr_1" })
    const res = await bulkRejectPayout(
      req("PATCH", undefined, { ids: ["pr_1"], reason: "Invalid details" }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, count: 1 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PAYOUT_REJECTED" }),
    )
  })
})
