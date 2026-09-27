import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const state = vi.hoisted(() => ({
  rateLimited: null as NextResponse | null,
  findUser: vi.fn(),
  activateAccount: vi.fn(async () => {}),
  countModeratorSlots: vi.fn(async () => 0),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByIp: () => Promise.resolve(state.rateLimited),
}))

vi.mock("@/lib/activation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activation")>()),
  findUserByActivationToken: state.findUser,
  activateAccount: state.activateAccount,
  countModeratorSlots: state.countModeratorSlots,
}))

const dbState = vi.hoisted(() => {
  const selectQueue: unknown[][] = []
  return { selectQueue }
})

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(dbState.selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    transaction: (fn: (tx: unknown) => unknown) => fn({}),
  }
  return { db, dbRead: db, pool: {} }
})

function req(body: unknown): Request {
  return new Request("http://test.local/api/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validBody = { token: "raw-token", password: "NewPass123!" }

const userRow = { id: "user_1", email: "amy@acme.test" }

const moderatorProfile = {
  userId: "user_1",
  role: "MERCHANT",
  merchantId: "MER-1",
  isModerator: true,
  isActive: false,
  activatedAt: null,
}

const warehouseProfile = {
  userId: "user_1",
  role: "WAREHOUSE_ADMIN",
  merchantId: null,
  isModerator: false,
  isActive: false,
  activatedAt: null,
}

beforeEach(() => {
  dbState.selectQueue.length = 0
  state.rateLimited = null
  state.findUser.mockReset()
  state.activateAccount.mockClear()
  state.countModeratorSlots.mockClear()
  state.countModeratorSlots.mockResolvedValue(0)
})

describe("POST /api/activate", () => {
  it("rate-limits repeated attempts", async () => {
    state.rateLimited = NextResponse.json(
      { error: "Too many" },
      { status: 429 },
    )
    const res = await POST(req(validBody))
    expect(res.status).toBe(429)
    expect(state.findUser).not.toHaveBeenCalled()
  })

  it("400 for a body that fails validation", async () => {
    const res = await POST(req({ token: "raw-token", password: "short" }))
    expect(res.status).toBe(400)
    expect(state.findUser).not.toHaveBeenCalled()
  })

  it("400 for an unknown token", async () => {
    state.findUser.mockResolvedValue(null)
    const res = await POST(req(validBody))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("invalid or has expired")
  })

  it("400 when the profile row is missing", async () => {
    state.findUser.mockResolvedValue(userRow)
    dbState.selectQueue.push([])
    const res = await POST(req(validBody))
    expect(res.status).toBe(400)
  })

  it("400 when the account is already activated", async () => {
    state.findUser.mockResolvedValue(userRow)
    dbState.selectQueue.push([
      { ...moderatorProfile, activatedAt: "2026-01-01" },
    ])
    const res = await POST(req(validBody))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("already activated")
  })

  it("400 when a moderator profile has no merchant", async () => {
    state.findUser.mockResolvedValue(userRow)
    dbState.selectQueue.push([{ ...moderatorProfile, merchantId: null }])
    const res = await POST(req(validBody))
    expect(res.status).toBe(400)
  })

  it("403 when the moderator quota is full at click time", async () => {
    state.findUser.mockResolvedValue(userRow)
    state.countModeratorSlots.mockResolvedValue(3)
    dbState.selectQueue.push([moderatorProfile], [{ maxModerators: 3 }])
    const res = await POST(req(validBody))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain("3/3")
    expect(state.activateAccount).not.toHaveBeenCalled()
    // The invite's own slot is excluded from the count.
    expect(state.countModeratorSlots).toHaveBeenCalledWith("MER-1", "user_1")
  })

  it("activates a moderator within quota", async () => {
    state.findUser.mockResolvedValue(userRow)
    state.countModeratorSlots.mockResolvedValue(1)
    dbState.selectQueue.push([moderatorProfile], [{ maxModerators: 3 }])
    const res = await POST(req(validBody))
    expect(res.status).toBe(200)
    expect(state.activateAccount).toHaveBeenCalledWith({
      userId: "user_1",
      password: "NewPass123!",
    })
  })

  it("activates a warehouse admin with no quota check", async () => {
    state.findUser.mockResolvedValue(userRow)
    dbState.selectQueue.push([warehouseProfile])
    const res = await POST(req(validBody))
    expect(res.status).toBe(200)
    expect(state.countModeratorSlots).not.toHaveBeenCalled()
    expect(state.activateAccount).toHaveBeenCalledWith({
      userId: "user_1",
      password: "NewPass123!",
    })
  })
})
