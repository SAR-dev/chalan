import { beforeEach, describe, expect, it, vi } from "vitest"
import { logAudit } from "@/lib/audit"
import { POST as resendActivation } from "./[userId]/resend-activation/route"
import { PATCH } from "./[userId]/route"
import { GET, POST } from "./route"

const state = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  createUserShouldFail: false,
  issueActivationToken: vi.fn(async () => "raw-token"),
  sendActivationEmail: vi.fn(async () => {}),
  countModeratorSlots: vi.fn(async () => 0),
  /** Slots free per call; `Infinity` means "always a free slot". */
  freeSlots: vi.fn(() => 0),
  /** Set to make `lockModeratorQuota` behave as if the merchant vanished. */
  merchantMissing: false,
  hasActiveMailConfig: vi.fn(async () => true),
}))

vi.mock("@/lib/mail-config", () => ({
  hasActiveMailConfig: state.hasActiveMailConfig,
  MAIL_NOT_CONFIGURED_MESSAGE: "Mail server is not set up yet.",
}))

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(state.session),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
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

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createUser: (args: { body: { name: string; email: string } }) =>
        state.createUserShouldFail
          ? Promise.reject(new Error("email exists"))
          : Promise.resolve({
              user: {
                id: "mod_1",
                name: args.body.name,
                email: args.body.email,
                emailVerified: false,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            }),
    },
  },
}))

vi.mock("@/lib/activation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/activation")>()
  return {
    ...original,
    issueActivationToken: state.issueActivationToken,
    sendActivationEmail: state.sendActivationEmail,
    countModeratorSlots: state.countModeratorSlots,
    // Stands in for the locked, in-transaction quota check. The real
    // implementation is covered in `lib/activation.spec.ts`; here we only care
    // that both routes surface its two outcomes.
    lockModeratorQuota: async (
      _tx: unknown,
      merchantId: string,
      excludeUserId?: string,
    ) => {
      if (state.merchantMissing) return null
      const free = state.freeSlots()
      if (free <= 0) {
        throw new original.ModeratorQuotaError(3, 3)
      }
      return { maxModerators: 3, used: 3 - free, merchantId, excludeUserId }
    },
  }
})

const dbState = vi.hoisted(() => {
  const selectQueue: unknown[][] = []
  const insertPayloads: Record<string, unknown>[] = []
  const updatePayloads: Record<string, unknown>[] = []
  const updateResult: unknown[] = []
  /** User ids passed to `DELETE FROM user` (orphan cleanup after a failure). */
  const deletedUserIds: string[] = []
  /** Set to make the next `db.transaction` reject. */
  let transactionError: Error | null = null
  return {
    selectQueue,
    insertPayloads,
    updatePayloads,
    updateResult,
    deletedUserIds,
    setTransactionError: (err: Error | null) => {
      transactionError = err
    },
    takeTransactionError: () => {
      const err = transactionError
      transactionError = null
      return err
    },
  }
})

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
      innerJoin: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      leftJoin: () => chain,
      for: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(dbState.selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        dbState.insertPayloads.push(payload)
        return Promise.resolve([])
      },
    }),
    update: () => {
      const chain: Record<string, unknown> = {
        set: (vals: Record<string, unknown>) => {
          dbState.updatePayloads.push(vals)
          return chain
        },
        where: () => chain,
        returning: () => Promise.resolve(dbState.updateResult),
      }
      return chain
    },
    delete: () => ({
      where: (clause: unknown) => {
        dbState.deletedUserIds.push(extractParamValue(clause))
        return Promise.resolve([])
      },
    }),
    transaction: (fn: (tx: unknown) => unknown) => {
      const err = dbState.takeTransactionError()
      if (err) return Promise.reject(err)
      return fn(db)
    },
  }
  return { db, dbRead: db, pool: {} }
})

beforeEach(() => {
  dbState.selectQueue.length = 0
  dbState.insertPayloads.length = 0
  dbState.updatePayloads.length = 0
  dbState.updateResult.length = 0
  dbState.deletedUserIds.length = 0
  dbState.setTransactionError(null)
  state.session = null
  state.createUserShouldFail = false
  state.merchantMissing = false
  state.issueActivationToken.mockClear()
  state.sendActivationEmail.mockClear()
  state.countModeratorSlots.mockClear()
  state.countModeratorSlots.mockResolvedValue(0)
  state.freeSlots.mockClear()
  state.freeSlots.mockReturnValue(1)
  state.hasActiveMailConfig.mockReset()
  state.hasActiveMailConfig.mockResolvedValue(true)
  vi.mocked(logAudit).mockClear()
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function params(id = "MER-1", userId = "m1") {
  return {
    params: Promise.resolve({ id, userId }),
  }
}

const owner = {
  role: "MERCHANT",
  merchantId: "MER-1",
  name: "Owner O",
  userId: "u_owner",
  isModerator: false,
  moderatorPermissions: null,
}
const moderatorSession = {
  role: "MERCHANT",
  merchantId: "MER-1",
  name: "Mod M",
  userId: "u_mod",
  isModerator: true,
  moderatorPermissions: ["/merchant/orders"],
}
const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u_admin" }

const merchantRow = { maxModerators: 3, businessName: "Acme Corp" }

describe("GET /api/merchants/:id/moderators", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(req("GET"), params())
    expect(res.status).toBe(401)
  })

  it("403 for admins (owner-only surface)", async () => {
    state.session = admin
    const res = await GET(req("GET"), params())
    expect(res.status).toBe(403)
  })

  it("403 for a moderator (Settings nav never grantable)", async () => {
    state.session = moderatorSession
    const res = await GET(req("GET"), params())
    expect(res.status).toBe(403)
  })

  it("403 when the merchant id doesn't match the session", async () => {
    state.session = { ...owner, merchantId: "MER-999" }
    const res = await GET(req("GET"), params())
    expect(res.status).toBe(403)
  })

  it("lists moderators with derived status and quota", async () => {
    state.session = owner
    state.countModeratorSlots.mockResolvedValue(1)
    dbState.selectQueue.push(
      [merchantRow],
      [
        {
          userId: "m1",
          name: "Active Amy",
          email: "amy@acme.test",
          isActive: true,
          activatedAt: "2026-01-02T00:00:00.000Z",
          permissions: ["/merchant/orders"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          userId: "m2",
          name: "Pending Pat",
          email: "pat@acme.test",
          isActive: false,
          activatedAt: null,
          permissions: ["/merchant/finance"],
          createdAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    )
    const res = await GET(req("GET"), params())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(2)
    expect(json.data[0]).toMatchObject({
      userId: "m1",
      status: "ACTIVE",
      permissions: ["/merchant/orders"],
    })
    expect(json.data[1]).toMatchObject({ userId: "m2", status: "PENDING" })
    expect(json.quota).toEqual({ used: 1, max: 3 })
  })
})

describe("POST /api/merchants/:id/moderators", () => {
  const validBody = {
    name: "New Mod",
    email: "mod@acme.test",
    password: "TempPass123!",
    permissions: ["/merchant/orders"],
  }

  it("401 when unauthenticated", async () => {
    const res = await POST(req("POST", validBody), params())
    expect(res.status).toBe(401)
  })

  it("403 for a moderator", async () => {
    state.session = moderatorSession
    const res = await POST(req("POST", validBody), params())
    expect(res.status).toBe(403)
  })

  it("400 for non-grantable permissions", async () => {
    state.session = owner
    const res = await POST(
      req("POST", { ...validBody, permissions: ["/merchant/settings"] }),
      params(),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Invalid access grants")
  })

  it("403 when the quota is full", async () => {
    state.session = owner
    // P1.1: the check happens inside the transaction, under a row lock, and
    // before anything is written.
    state.freeSlots.mockReturnValue(0)
    const res = await POST(req("POST", validBody), params())
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("3/3")
    expect(dbState.insertPayloads).toHaveLength(0)
  })

  it("400 when the email is already in use", async () => {
    state.session = owner
    state.createUserShouldFail = true
    const res = await POST(req("POST", validBody), params())
    expect(res.status).toBe(400)
  })

  it("creates a PENDING moderator and sends the activation email", async () => {
    state.session = owner
    dbState.selectQueue.push([merchantRow])
    const res = await POST(req("POST", validBody), params())
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json).toMatchObject({ status: "PENDING", email: "mod@acme.test" })
    expect(dbState.insertPayloads[0]).toMatchObject({
      role: "MERCHANT",
      merchantId: "MER-1",
      isActive: false,
      isModerator: true,
      moderatorPermissions: ["/merchant/orders"],
    })
    // Token issue, profile write and audit all share one transaction.
    expect(state.issueActivationToken).toHaveBeenCalledWith(
      "mod_1",
      expect.anything(),
    )
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MODERATOR_CREATED" }),
      expect.anything(),
    )
    expect(state.sendActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mod@acme.test",
        contextName: "Acme Corp",
        rawToken: "raw-token",
      }),
      // Enqueued inside the creation transaction (ROADMAP P1.5).
      expect.anything(),
    )
  })

  it("404 when the merchant disappeared before the lock", async () => {
    state.session = owner
    state.merchantMissing = true
    const res = await POST(req("POST", validBody), params())
    expect(res.status).toBe(404)
    expect(dbState.insertPayloads).toHaveLength(0)
    // The auth user created for this invite must not be left behind.
    expect(dbState.deletedUserIds).toEqual(["mod_1"])
    expect(state.sendActivationEmail).not.toHaveBeenCalled()
  })

  it("deletes the auth user when the transaction fails", async () => {
    state.session = owner
    dbState.setTransactionError(new Error("deadlock detected"))
    const res = await POST(req("POST", validBody), params())
    expect(res.status).toBe(500)
    expect(dbState.deletedUserIds).toEqual(["mod_1"])
    expect(state.sendActivationEmail).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/merchants/:id/moderators/:userId", () => {
  const activeTarget = {
    userId: "m1",
    isActive: true,
    activatedAt: "2026-01-02T00:00:00.000Z",
    permissions: ["/merchant/orders"],
  }

  it("401 when unauthenticated", async () => {
    const res = await PATCH(req("PATCH", { isActive: false }), params())
    expect(res.status).toBe(401)
  })

  it("403 for a moderator", async () => {
    state.session = moderatorSession
    const res = await PATCH(req("PATCH", { isActive: false }), params())
    expect(res.status).toBe(403)
  })

  it("404 when the target isn't a moderator of this merchant", async () => {
    state.session = owner
    dbState.selectQueue.push([])
    const res = await PATCH(req("PATCH", { isActive: false }), params())
    expect(res.status).toBe(404)
  })

  it("400 when nothing is provided to update", async () => {
    state.session = owner
    dbState.selectQueue.push([activeTarget])
    const res = await PATCH(req("PATCH", {}), params())
    expect(res.status).toBe(400)
  })

  it("400 when isActive already holds the requested value", async () => {
    state.session = owner
    dbState.selectQueue.push([activeTarget])
    const res = await PATCH(req("PATCH", { isActive: true }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("No changes to save")
    expect(dbState.updatePayloads).toHaveLength(0)
  })

  it("400 for non-grantable permissions", async () => {
    state.session = owner
    dbState.selectQueue.push([activeTarget])
    const res = await PATCH(
      req("PATCH", { permissions: ["/merchant/settings"] }),
      params(),
    )
    expect(res.status).toBe(400)
  })

  it("400 when trying to activate an invite that was never activated", async () => {
    state.session = owner
    dbState.selectQueue.push([
      { userId: "m2", isActive: false, activatedAt: null, permissions: [] },
    ])
    const res = await PATCH(req("PATCH", { isActive: true }), params())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("resend the activation link")
  })

  it("403 when re-activating would exceed the quota", async () => {
    state.session = owner
    state.freeSlots.mockReturnValue(0)
    dbState.selectQueue.push([{ ...activeTarget, isActive: false }])
    const res = await PATCH(req("PATCH", { isActive: true }), params())
    expect(res.status).toBe(403)
    expect(dbState.updatePayloads).toHaveLength(0)
  })

  it("deactivating does not consume quota and works when slots are full", async () => {
    state.session = owner
    state.freeSlots.mockReturnValue(0)
    dbState.selectQueue.push([activeTarget])
    dbState.updateResult.push({ ...activeTarget, isActive: false })
    const res = await PATCH(req("PATCH", { isActive: false }), params())
    expect(res.status).toBe(200)
    expect(dbState.updatePayloads[0]).toMatchObject({ isActive: false })
  })

  it("409 when the row changed between the read and the update", async () => {
    // P1.1: the conditional update is what stops a concurrent change from
    // slipping past the checks done earlier in the transaction.
    state.session = owner
    dbState.selectQueue.push([activeTarget])
    dbState.updateResult.length = 0
    const res = await PATCH(req("PATCH", { isActive: false }), params())
    expect(res.status).toBe(409)
    expect(logAudit).not.toHaveBeenCalled()
  })

  it("deactivates and audits", async () => {
    state.session = owner
    dbState.selectQueue.push([activeTarget])
    dbState.updateResult.push({
      ...activeTarget,
      isActive: false,
      moderatorPermissions: activeTarget.permissions,
    })
    const res = await PATCH(req("PATCH", { isActive: false }), params())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.status).toBe("DEACTIVATED")
    expect(dbState.updatePayloads[0]).toMatchObject({ isActive: false })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MODERATOR_UPDATED",
        metadata: {
          merchantId: "MER-1",
          diff: { isActive: { from: true, to: false } },
        },
      }),
      expect.anything(),
    )
  })

  it("updates permissions and audits the diff", async () => {
    state.session = owner
    dbState.selectQueue.push([activeTarget])
    dbState.updateResult.push({
      ...activeTarget,
      moderatorPermissions: ["/merchant/finance"],
    })
    const res = await PATCH(
      req("PATCH", { permissions: ["/merchant/finance"] }),
      params(),
    )
    expect(res.status).toBe(200)
    expect(dbState.updatePayloads[0]).toMatchObject({
      moderatorPermissions: ["/merchant/finance"],
    })
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MODERATOR_UPDATED",
        metadata: {
          merchantId: "MER-1",
          diff: {
            permissions: {
              from: ["/merchant/orders"],
              to: ["/merchant/finance"],
            },
          },
        },
      }),
      expect.anything(),
    )
  })
})

describe("POST .../moderators/:userId/resend-activation", () => {
  it("401 when unauthenticated", async () => {
    const res = await resendActivation(req("POST"), params())
    expect(res.status).toBe(401)
  })

  it("403 for non-owners", async () => {
    state.session = admin
    const res = await resendActivation(req("POST"), params())
    expect(res.status).toBe(403)
  })

  it("404 for an unknown moderator", async () => {
    state.session = owner
    dbState.selectQueue.push([])
    const res = await resendActivation(req("POST"), params())
    expect(res.status).toBe(404)
  })

  it("400 when the account is already activated", async () => {
    state.session = owner
    dbState.selectQueue.push([
      {
        activatedAt: "2026-01-02T00:00:00.000Z",
        name: "Active Amy",
        email: "amy@acme.test",
        businessName: "Acme Corp",
      },
    ])
    const res = await resendActivation(req("POST"), params())
    expect(res.status).toBe(400)
  })

  it("400 when no active mail config exists", async () => {
    state.session = owner
    state.hasActiveMailConfig.mockResolvedValue(false)
    dbState.selectQueue.push([
      {
        activatedAt: null,
        name: "Pending Pat",
        email: "pat@acme.test",
        businessName: "Acme Corp",
      },
    ])
    const res = await resendActivation(req("POST"), params())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("Mail server is not set up")
    expect(state.issueActivationToken).not.toHaveBeenCalled()
  })

  it("issues a fresh token and emails it for a pending moderator", async () => {
    state.session = owner
    dbState.selectQueue.push([
      {
        activatedAt: null,
        name: "Pending Pat",
        email: "pat@acme.test",
        businessName: "Acme Corp",
      },
    ])
    const res = await resendActivation(req("POST"), params())
    expect(res.status).toBe(200)
    expect(state.issueActivationToken).toHaveBeenCalledWith(
      expect.any(String),
      // Token re-issued inside the resend transaction (ROADMAP P1.5).
      expect.anything(),
    )
    expect(state.sendActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "pat@acme.test",
        contextName: "Acme Corp",
        rawToken: "raw-token",
      }),
      expect.anything(),
    )
  })
})
