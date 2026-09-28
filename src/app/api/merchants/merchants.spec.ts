import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { SEED_IMAGE_PLACEHOLDER } from "@/lib/db/seed/seed-content"
import { PATCH as approveMerchant } from "./[id]/approve/route"
import { POST as adjustBalance } from "./[id]/balance/adjust/route"
import { PATCH as confirmPayment } from "./[id]/balance/payment/[txId]/confirm/route"
import { PATCH as rejectPayment } from "./[id]/balance/payment/[txId]/reject/route"
import { POST as submitPayment } from "./[id]/balance/payment/route"
import { GET as getMerchantBalance } from "./[id]/balance/route"
import { PATCH as submitNid } from "./[id]/nid/route"
import { PATCH as reviewNid } from "./[id]/nid/verify/route"
import { PATCH as setMerchantPricing } from "./[id]/pricing/route"
import { PATCH as reactivateMerchant } from "./[id]/reactivate/route"
import { GET as getMerchant, PATCH as updateMerchant } from "./[id]/route"
import { PATCH as suspendMerchant } from "./[id]/suspend/route"
import { POST as sendVerifyEmail } from "./[id]/verify-email/route"
import { POST as createMerchant, GET as listMerchants } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }
let rateLimited = false
let mailConfigEnabled = true

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

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createUser: () => Promise.resolve({ user: { id: "auth_user_id" } }),
    },
  },
}))

vi.mock("@/lib/mailer", () => ({
  sendMail: () => Promise.resolve(),
  toPlainText: (html: string) => html.replace(/<[^>]+>/g, ""),
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

vi.mock("@/lib/mail-config", () => ({
  hasActiveMailConfig: () => Promise.resolve(mailConfigEnabled),
  MAIL_NOT_CONFIGURED_MESSAGE: "Mail server is not set up yet.",
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []
/** Set to make the next `db.transaction` reject (e.g. a unique violation). */
let transactionError: Error | null = null

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      leftJoin: () => chain,
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
      onConflictDoUpdate: () => Promise.resolve(),
    }
    return chain
  }
  const makeDeleteChain = () => {
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(),
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
    delete: () => makeDeleteChain(),
    transaction: (fn: (t: typeof tx) => unknown) => {
      if (transactionError) {
        const err = transactionError
        transactionError = null
        return Promise.reject(err)
      }
      return fn(tx)
    },
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  transactionError = null
  sessionState.value = null
  rateLimited = false
  mailConfigEnabled = true
  vi.mocked(logAudit).mockClear()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "m_1") {
  return { params: Promise.resolve({ id }) }
}

function ctxBalanceTx(id = "m_1", txId = "tx_1") {
  return { params: Promise.resolve({ id, txId }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }
const superAdmin = { role: "SUPER_ADMIN", name: "Super", userId: "u2" }
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u3",
  merchantId: "m_1",
}
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "Warehouse Wan",
  userId: "u4",
}

describe("GET /api/merchants", () => {
  it("401 when unauthenticated", async () => {
    const res = await listMerchants(req("GET"))
    expect(res.status).toBe(401)
  })

  it("merchant sees own profile only", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1", businessName: "My Biz" }])
    const res = await listMerchants(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(1)
  })

  it("warehouse admin sees PII-light list (no NID/rates/balance)", async () => {
    sessionState.value = warehouseAdmin
    selectQueue.push([
      { id: "m_1", businessName: "My Biz", phone: "017", status: "APPROVED" },
      { id: "m_2", businessName: "Other", phone: "018", status: "PENDING" },
    ])
    const res = await listMerchants(req("GET"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
    expect(json.data[0]).not.toHaveProperty("nidNumber")
    expect(json.data[0]).not.toHaveProperty("baseRate")
    expect(json.data[0]).not.toHaveProperty("balance")
    expect(json.data[0]).not.toHaveProperty("email")
    expect(json.data[0]).toHaveProperty("businessName")
  })

  it("admin sees paginated list", async () => {
    sessionState.value = admin
    selectQueue.push([{ count: 2 }], [{ id: "m_1" }, { id: "m_2" }])
    const res = await listMerchants(
      req("GET", "http://test.local/api?limit=10"),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
  })
})

describe("POST /api/merchants", () => {
  const validBody = {
    businessName: "New Biz",
    ownerName: "Owner",
    email: "owner@test.com",
    phone: "01712345678",
    address: "Addr",
    password: "Secret123!",
  }

  it("400 on invalid body", async () => {
    const res = await createMerchant(req("POST", undefined, {}))
    expect(res.status).toBe(400)
  })

  it("creates merchant", async () => {
    insertResult.push({
      id: "m_new",
      businessName: "New Biz",
      status: "PENDING",
    })
    const res = await createMerchant(req("POST", undefined, validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "m_new" })
  })
})

describe("GET /api/merchants/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await getMerchant(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-owner merchant", async () => {
    sessionState.value = { role: "MERCHANT", merchantId: "m_other" }
    const res = await getMerchant(req("GET"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await getMerchant(req("GET"), ctx())
    expect(res.status).toBe(404)
  })

  it("returns merchant for admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1", businessName: "Biz" }])
    const res = await getMerchant(req("GET"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "m_1" })
  })
})

describe("PATCH /api/merchants/:id", () => {
  const validBody = {
    businessName: "Updated Biz",
    email: "new@test.com",
    phone: "01712345678",
    address: "New addr",
  }

  it("401 when unauthenticated", async () => {
    const res = await updateMerchant(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-owner merchant", async () => {
    sessionState.value = { role: "MERCHANT", merchantId: "m_other" }
    const res = await updateMerchant(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(403)
  })

  it("updates merchant details", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ email: "old@test.com" }]) // previous email
    selectQueue.push([{ userId: "u_owner" }]) // owner profile
    updateResult.push({
      id: "m_1",
      businessName: "Updated Biz",
      email: "new@test.com",
    })
    const res = await updateMerchant(req("PATCH", undefined, validBody), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toBeDefined()
    // A second write syncs the owner's auth user (no businessName) so login
    // keeps working (P1.4c).
    expect(
      updatePayloads.some(
        (p) => p.email === "new@test.com" && !("businessName" in p),
      ),
    ).toBe(true)
  })

  it("409 when the new email is already in use", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ email: "old@test.com" }])
    transactionError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    })
    const res = await updateMerchant(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("already in use")
  })

  it("updates branding fields", async () => {
    sessionState.value = merchantSession
    updateResult.push({
      id: "m_1",
      logoUrl: "https://example.com/logo.png",
      brandColor: "#10b981",
      hidePlatformBranding: true,
    })
    const res = await updateMerchant(
      req("PATCH", undefined, {
        logoUrl: "https://example.com/logo.png",
        brandColor: "#10b981",
        hidePlatformBranding: true,
      }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      logoUrl: "https://example.com/logo.png",
      brandColor: "#10b981",
      hidePlatformBranding: true,
    })
  })

  it("updates only brandColor", async () => {
    sessionState.value = merchantSession
    updateResult.push({ id: "m_1", brandColor: "#f97316" })
    const res = await updateMerchant(
      req("PATCH", undefined, { brandColor: "#f97316" }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toMatchObject({ brandColor: "#f97316" })
  })

  it("updates only hidePlatformBranding", async () => {
    sessionState.value = merchantSession
    updateResult.push({ id: "m_1", hidePlatformBranding: true })
    const res = await updateMerchant(
      req("PATCH", undefined, { hidePlatformBranding: true }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toMatchObject({ hidePlatformBranding: true })
  })

  it("clears logo by setting null", async () => {
    sessionState.value = merchantSession
    updateResult.push({ id: "m_1", logoUrl: null })
    const res = await updateMerchant(
      req("PATCH", undefined, { logoUrl: null }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toMatchObject({ logoUrl: null })
  })

  it("rejects invalid hex color", async () => {
    sessionState.value = merchantSession
    const res = await updateMerchant(
      req("PATCH", undefined, { brandColor: "not-a-color" }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("403 for a moderator (Business Settings is owner-only)", async () => {
    sessionState.value = {
      ...merchantSession,
      isModerator: true,
      moderatorPermissions: ["/merchant/orders"],
    }
    const res = await updateMerchant(
      req("PATCH", undefined, { brandColor: "#10b981" }),
      ctx(),
    )
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("owner-only")
    expect(updatePayloads).toHaveLength(0)
  })

  it("admin sets the moderator quota (audited)", async () => {
    sessionState.value = superAdmin
    updateResult.push({ id: "m_1", businessName: "Acme", maxModerators: 5 })
    const res = await updateMerchant(
      req("PATCH", undefined, { maxModerators: 5 }),
      ctx(),
    )
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toMatchObject({ maxModerators: 5 })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MODERATOR_QUOTA_CHANGED",
        metadata: { maxModerators: 5 },
      }),
      expect.anything(),
    )
  })

  it("403 when the merchant owner tries to set the quota", async () => {
    sessionState.value = merchantSession
    const res = await updateMerchant(
      req("PATCH", undefined, { maxModerators: 5 }),
      ctx(),
    )
    expect(res.status).toBe(403)
    expect(updatePayloads).toHaveLength(0)
  })

  it("400 for a quota outside 0-20", async () => {
    sessionState.value = superAdmin
    const res = await updateMerchant(
      req("PATCH", undefined, { maxModerators: 25 }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })
})

describe("PATCH /api/merchants/:id/approve", () => {
  it("401 when unauthenticated", async () => {
    const res = await approveMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-admin", async () => {
    sessionState.value = merchantSession
    const res = await approveMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when merchant not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await approveMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(404)
  })

  it("400 when not PENDING", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "ACTIVE", emailVerifiedAt: null }])
    const res = await approveMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(400)
  })

  it("409 when the status changed between the read and the write", async () => {
    // P1.1: the write is predicated on the status that was validated, so a
    // concurrent approve/suspend cannot be overwritten.
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", emailVerifiedAt: "2025-01-01T00:00:00Z" },
    ])
    updateResult.length = 0
    const res = await approveMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("changed by someone else")
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("400 when email not verified", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "PENDING", emailVerifiedAt: null }])
    const res = await approveMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("verify their email")
  })

  it("approves merchant when email verified", async () => {
    sessionState.value = admin
    selectQueue.push([
      { status: "PENDING", emailVerifiedAt: "2025-01-01T00:00:00Z" },
    ])
    updateResult.push({
      id: "m_1",
      businessName: "Biz",
      email: "biz@test.com",
      ownerName: "Owner",
      status: "ACTIVE",
      approvedBy: "Admin Amy",
      approvedAt: "2025-01-02T00:00:00Z",
    })
    const res = await approveMerchant(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "ACTIVE" })
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_APPROVED",
        metadata: {
          diff: {
            status: { from: "PENDING", to: "ACTIVE" },
            approvedBy: { from: null, to: "Admin Amy" },
            approvedAt: {
              from: null,
              to: "2025-01-02T00:00:00Z",
            },
          },
        },
      }),
      // Audit + email outbox row commit in the approval transaction (P1.4/P1.5).
      expect.anything(),
    )
  })
})

describe("PATCH /api/merchants/:id/suspend", () => {
  it("401 when unauthenticated", async () => {
    const res = await suspendMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await suspendMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when not found", async () => {
    sessionState.value = admin
    updateResult.length = 0
    const res = await suspendMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(404)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("400 when the merchant is already suspended", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "SUSPENDED" }])
    const res = await suspendMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("409 when the status changed between the read and the write", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "ACTIVE" }])
    updateResult.length = 0
    const res = await suspendMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(409)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("suspends merchant", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "ACTIVE" }])
    updateResult.push({ id: "m_1", businessName: "Biz", status: "SUSPENDED" })
    const res = await suspendMerchant(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "SUSPENDED" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_SUSPENDED",
        metadata: {
          diff: { status: { from: "ACTIVE", to: "SUSPENDED" } },
        },
      }),
    )
  })
})

describe("PATCH /api/merchants/:id/reactivate", () => {
  it("401 when unauthenticated", async () => {
    const res = await reactivateMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await reactivateMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("400 when the merchant is not suspended", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "ACTIVE" }])
    const res = await reactivateMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("409 when the status changed between the read and the write", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "SUSPENDED" }])
    updateResult.length = 0
    const res = await reactivateMerchant(req("PATCH"), ctx())
    expect(res.status).toBe(409)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("reactivates merchant", async () => {
    sessionState.value = admin
    selectQueue.push([{ status: "SUSPENDED" }])
    updateResult.push({ id: "m_1", businessName: "Biz", status: "ACTIVE" })
    const res = await reactivateMerchant(req("PATCH"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ status: "ACTIVE" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_REACTIVATED",
        metadata: {
          diff: { status: { from: "SUSPENDED", to: "ACTIVE" } },
        },
      }),
    )
  })
})

describe("PATCH /api/merchants/:id/pricing", () => {
  const validBody = {
    baseRate: 60,
    extraRatePerKg: 15,
    freeWeightKg: 1,
    maxWeightKg: 5,
  }

  it("401 when unauthenticated", async () => {
    const res = await setMerchantPricing(
      req("PATCH", undefined, validBody),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-admin", async () => {
    sessionState.value = merchantSession
    const res = await setMerchantPricing(
      req("PATCH", undefined, validBody),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("updates pricing", async () => {
    sessionState.value = superAdmin
    selectQueue.push([
      { baseRate: 50, extraRatePerKg: 10, freeWeightKg: 1, maxWeightKg: 3 },
    ])
    updateResult.push({
      id: "m_1",
      businessName: "Biz",
      baseRate: 60,
      extraRatePerKg: 10,
      freeWeightKg: 1,
      maxWeightKg: 3,
    })
    const res = await setMerchantPricing(
      req("PATCH", undefined, validBody),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toBeDefined()
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MERCHANT_PRICING_UPDATED",
        metadata: {
          diff: { baseRate: { from: 50, to: 60 } },
        },
      }),
    )
  })
})

describe("GET /api/merchants/:id/balance", () => {
  it("401 when unauthenticated", async () => {
    const res = await getMerchantBalance(req("GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("returns balance with transactions", async () => {
    sessionState.value = merchantSession
    selectQueue.push(
      [{ balance: 500, pendingBalance: 0 }],
      [{ count: 2 }],
      [
        { id: "tx_1", amount: 100 },
        { id: "tx_2", amount: 200 },
      ],
    )
    const res = await getMerchantBalance(req("GET"), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.balance).toBe(500)
    expect(json.total).toBe(2)
  })
})

describe("POST /api/merchants/:id/balance/adjust", () => {
  it("401 when unauthenticated", async () => {
    const res = await adjustBalance(
      req("POST", undefined, { amount: 100, note: "Credit" }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-super-admin", async () => {
    sessionState.value = {
      role: "WAREHOUSE_ADMIN",
      name: "WH Admin",
      userId: "u_wh",
    }
    const res = await adjustBalance(
      req("POST", undefined, { amount: 100, note: "Credit" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("adjusts balance", async () => {
    sessionState.value = superAdmin
    selectQueue.push(
      [{ balance: 500, pendingBalance: 0 }],
      [{ balance: 600, pendingBalance: 0 }],
    )
    insertResult.push({ id: "tx_new", amount: 100 })
    const res = await adjustBalance(
      req("POST", undefined, { amount: 100, note: "Credit" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "tx_new" })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BALANCE_ADJUSTED",
        metadata: {
          diff: { balance: { from: 500, to: 600 } },
        },
      }),
    )
  })
})

describe("POST /api/merchants/:id/balance/payment", () => {
  const validBody = {
    amount: 500,
    paymentMethod: "bkash",
    paymentAccount: "01xxxx",
  }

  it("401 when unauthenticated", async () => {
    const res = await submitPayment(req("POST", undefined, validBody), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-owner merchant", async () => {
    sessionState.value = { role: "MERCHANT", merchantId: "m_other" }
    const res = await submitPayment(req("POST", undefined, validBody), ctx())
    expect(res.status).toBe(403)
  })

  it("submits payment", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ merchantId: "m_1" }]) // balance row lock
    selectQueue.push([]) // no pending payment
    insertResult.push({ id: "tx_new", amount: -500, status: "PENDING" })
    const res = await submitPayment(req("POST", undefined, validBody), ctx())
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ id: "tx_new" })
  })

  it("409 when a payment is already pending (checked inside the transaction)", async () => {
    // P1.1: the check moved inside the transaction, after the balance row lock.
    sessionState.value = merchantSession
    selectQueue.push([{ merchantId: "m_1" }])
    selectQueue.push([{ id: "tx_pending" }])
    const res = await submitPayment(req("POST", undefined, validBody), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("awaiting confirmation")
    expect(insertResult).toHaveLength(0)
  })

  it("409 when the unique index rejects a concurrent duplicate", async () => {
    // The row lock cannot serialize two transactions when the balance row does
    // not exist yet, so the partial unique index is the backstop.
    sessionState.value = merchantSession
    selectQueue.push([{ merchantId: "m_1" }])
    selectQueue.push([])
    transactionError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    })
    const res = await submitPayment(req("POST", undefined, validBody), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("awaiting confirmation")
  })

  it("500 when the write fails for an unrelated reason", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ merchantId: "m_1" }])
    selectQueue.push([])
    transactionError = new Error("boom")
    const res = await submitPayment(req("POST", undefined, validBody), ctx())
    expect(res.status).toBe(500)
  })
})

describe("PATCH /api/merchants/:id/balance/payment/:txId/confirm", () => {
  it("401 when unauthenticated", async () => {
    const res = await confirmPayment(req("PATCH"), ctxBalanceTx())
    expect(res.status).toBe(401)
  })

  it("403 for non-admin", async () => {
    sessionState.value = merchantSession
    const res = await confirmPayment(req("PATCH"), ctxBalanceTx())
    expect(res.status).toBe(403)
  })

  it("confirms payment", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "tx_1",
        merchantId: "m_1",
        type: "PAYMENT_PENDING",
        status: "PENDING",
        amount: -500,
        reviewedBy: null,
        reviewedAt: null,
        rejectReason: null,
      },
    ])
    updateResult.push({
      id: "tx_1",
      status: "SETTLED",
      type: "PAYMENT_CONFIRMED",
      amount: -500,
      reviewedBy: "Admin Amy",
      reviewedAt: "2025-01-02T00:00:00Z",
    })
    const res = await confirmPayment(req("PATCH"), ctxBalanceTx())
    expect(res.status).toBe(200)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BALANCE_PAYMENT_CONFIRMED",
        metadata: {
          diff: {
            status: { from: "PENDING", to: "SETTLED" },
            type: { from: "PAYMENT_PENDING", to: "PAYMENT_CONFIRMED" },
            reviewedBy: { from: null, to: "Admin Amy" },
            reviewedAt: { from: null, to: "2025-01-02T00:00:00Z" },
          },
        },
      }),
    )
  })
})

describe("PATCH /api/merchants/:id/balance/payment/:txId/reject", () => {
  it("401 when unauthenticated", async () => {
    const res = await rejectPayment(
      req("PATCH", undefined, { reason: "Invalid" }),
      ctxBalanceTx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for non-admin", async () => {
    sessionState.value = merchantSession
    const res = await rejectPayment(
      req("PATCH", undefined, { reason: "Invalid" }),
      ctxBalanceTx(),
    )
    expect(res.status).toBe(403)
  })

  it("rejects payment", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "tx_1",
        merchantId: "m_1",
        type: "PAYMENT_PENDING",
        status: "PENDING",
        amount: -500,
        reviewedBy: null,
        reviewedAt: null,
        rejectReason: null,
      },
    ])
    updateResult.push({
      id: "tx_1",
      status: "REJECTED",
      type: "PAYMENT_PENDING",
      amount: -500,
      reviewedBy: "Admin Amy",
      reviewedAt: "2025-01-02T00:00:00Z",
      rejectReason: "Invalid details",
    })
    const res = await rejectPayment(
      req("PATCH", undefined, { reason: "Invalid details" }),
      ctxBalanceTx(),
    )
    expect(res.status).toBe(200)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BALANCE_PAYMENT_REJECTED",
        metadata: {
          diff: {
            status: { from: "PENDING", to: "REJECTED" },
            reviewedBy: { from: null, to: "Admin Amy" },
            reviewedAt: { from: null, to: "2025-01-02T00:00:00Z" },
            rejectReason: { from: null, to: "Invalid details" },
          },
        },
      }),
    )
  })
})

describe("POST /api/merchants/:id/verify-email", () => {
  it("401 when unauthenticated", async () => {
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(401)
  })

  it("404 when merchant not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(404)
  })

  it("400 when email already verified", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        status: "PENDING",
        email: "test@test.com",
        ownerName: "Owner",
        businessName: "Biz",
        emailVerifiedAt: "2025-01-01T00:00:00Z",
      },
    ])
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("already verified")
  })

  it("400 when no active mail config exists", async () => {
    sessionState.value = merchantSession
    mailConfigEnabled = false
    selectQueue.push([
      {
        id: "m_1",
        status: "PENDING",
        email: "test@test.com",
        ownerName: "Owner",
        businessName: "Biz",
        emailVerifiedAt: null,
      },
    ])
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Mail server is not set up")
    expect(updatePayloads).toHaveLength(0)
  })

  it("sends verification email for own merchant", async () => {
    sessionState.value = merchantSession
    selectQueue.push([
      {
        id: "m_1",
        status: "PENDING",
        email: "test@test.com",
        ownerName: "Owner",
        businessName: "Biz",
        emailVerifiedAt: null,
      },
    ])
    updateResult.push({ id: "m_1" })
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it("sends verification email as admin", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        status: "PENDING",
        email: "test@test.com",
        ownerName: "Owner",
        businessName: "Biz",
        emailVerifiedAt: null,
      },
    ])
    updateResult.push({ id: "m_1" })
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(200)
  })

  it("403 when merchant tries to verify another merchant", async () => {
    sessionState.value = {
      role: "MERCHANT",
      name: "Other Merchant",
      userId: "u_other",
      merchantId: "m_other",
    }
    selectQueue.push([
      {
        id: "m_1",
        status: "PENDING",
        email: "test@test.com",
        ownerName: "Owner",
        businessName: "Biz",
        emailVerifiedAt: null,
      },
    ])
    const res = await sendVerifyEmail(req("POST"), ctx())
    expect(res.status).toBe(400)
  })
})

describe("PATCH /api/merchants/:id/nid", () => {
  const validBody = {
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
  }

  it("401 when unauthenticated", async () => {
    const res = await submitNid(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(401)
  })

  it("403 for non-owner merchant", async () => {
    sessionState.value = { role: "MERCHANT", merchantId: "m_other" }
    selectQueue.push([{ id: "m_1", emailVerifiedAt: new Date() }])
    const res = await submitNid(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when merchant not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await submitNid(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(404)
  })

  it("400 when email not verified", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1", emailVerifiedAt: null }])
    const res = await submitNid(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Email must be verified")
  })

  it("400 when missing front image", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1", emailVerifiedAt: new Date() }])
    const res = await submitNid(
      req("PATCH", undefined, {
        nidBackImage: "back",
        nidSelfieImage: "selfie",
      }),
      ctx(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 when missing back image", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1", emailVerifiedAt: new Date() }])
    const res = await submitNid(
      req("PATCH", undefined, {
        nidFrontImage: "front",
        nidSelfieImage: "selfie",
      }),
      ctx(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 when missing selfie image", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1", emailVerifiedAt: new Date() }])
    const res = await submitNid(
      req("PATCH", undefined, {
        nidFrontImage: "front",
        nidBackImage: "back",
      }),
      ctx(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("submits NID as merchant owner", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1", emailVerifiedAt: new Date() }])
    updateResult.push({
      id: "m_1",
      nidSubmittedAt: "2025-01-02T00:00:00Z",
      nidFrontImage: SEED_IMAGE_PLACEHOLDER,
      nidBackImage: SEED_IMAGE_PLACEHOLDER,
      nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    })
    const res = await submitNid(req("PATCH", undefined, validBody), ctx())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      nidFrontImage: SEED_IMAGE_PLACEHOLDER,
      nidBackImage: SEED_IMAGE_PLACEHOLDER,
      nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    })
  })

  it("submits NID as admin", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "m_1", emailVerifiedAt: new Date() }])
    updateResult.push({
      id: "m_1",
      nidSubmittedAt: "2025-01-02T00:00:00Z",
      nidFrontImage: SEED_IMAGE_PLACEHOLDER,
      nidBackImage: SEED_IMAGE_PLACEHOLDER,
      nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    })
    const res = await submitNid(req("PATCH", undefined, validBody), ctx())
    expect(res.status).toBe(200)
  })
})

describe("PATCH /api/merchants/:id/nid/verify", () => {
  it("401 when unauthenticated", async () => {
    const res = await reviewNid(
      req("PATCH", undefined, { action: "approve" }),
      ctx(),
    )
    expect(res.status).toBe(401)
  })

  it("403 for merchant role", async () => {
    sessionState.value = merchantSession
    const res = await reviewNid(
      req("PATCH", undefined, { action: "approve" }),
      ctx(),
    )
    expect(res.status).toBe(403)
  })

  it("404 when merchant not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await reviewNid(
      req("PATCH", undefined, { action: "approve" }),
      ctx(),
    )
    expect(res.status).toBe(404)
  })

  it("400 when NID not submitted", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        businessName: "Biz",
        nidSubmittedAt: null,
        nidVerifiedAt: null,
      },
    ])
    const res = await reviewNid(
      req("PATCH", undefined, { action: "approve" }),
      ctx(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("not submitted NID")
  })

  it("400 when NID already verified", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        businessName: "Biz",
        nidSubmittedAt: "2025-01-01T00:00:00Z",
        nidVerifiedAt: "2025-01-02T00:00:00Z",
      },
    ])
    const res = await reviewNid(
      req("PATCH", undefined, { action: "approve" }),
      ctx(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("already verified")
  })

  it("400 when invalid action", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        businessName: "Biz",
        nidSubmittedAt: "2025-01-01T00:00:00Z",
        nidVerifiedAt: null,
      },
    ])
    const res = await reviewNid(
      req("PATCH", undefined, { action: "invalid" }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("400 when rejecting without reason", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        businessName: "Biz",
        nidSubmittedAt: "2025-01-01T00:00:00Z",
        nidVerifiedAt: null,
      },
    ])
    const res = await reviewNid(
      req("PATCH", undefined, { action: "reject" }),
      ctx(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Rejection reason")
  })

  it("approves NID", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        businessName: "Biz",
        nidSubmittedAt: "2025-01-01T00:00:00Z",
        nidVerifiedAt: null,
      },
    ])
    updateResult.push({
      id: "m_1",
      nidVerifiedAt: "2025-01-02T00:00:00Z",
      nidVerifiedBy: "Admin Amy",
      nidRejectedAt: null,
      nidRejectedBy: null,
      nidRejectionReason: null,
    })
    const res = await reviewNid(
      req("PATCH", undefined, { action: "approve" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ nidVerifiedBy: "Admin Amy" })
  })

  it("rejects NID with reason", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "m_1",
        businessName: "Biz",
        nidSubmittedAt: "2025-01-01T00:00:00Z",
        nidVerifiedAt: null,
      },
    ])
    updateResult.push({
      id: "m_1",
      nidVerifiedAt: null,
      nidVerifiedBy: null,
      nidRejectedAt: "2025-01-02T00:00:00Z",
      nidRejectedBy: "Admin Amy",
      nidRejectionReason: "Image too blurry",
    })
    const res = await reviewNid(
      req("PATCH", undefined, { action: "reject", reason: "Image too blurry" }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      nidRejectionReason: "Image too blurry",
      nidRejectedBy: "Admin Amy",
    })
  })
})
