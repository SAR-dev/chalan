import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getMe, PATCH as updateMe } from "./route"

// PATCH gates on requireSession() (the GET stays lenient on purpose so the
// client can render the pending-activation state).
vi.mock("@/lib/api-auth", () => ({
  requireSession: () =>
    Promise.resolve(
      sessionState.value
        ? { userId: "u1", role: "MERCHANT", name: "Test User" }
        : null,
    ),
}))

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}))

const betterAuthSession: Record<string, unknown> | null = {
  user: {
    id: "u1",
    name: "Test User",
    email: "test@test.com",
    emailVerified: true,
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  session: {},
}
const sessionState: { value: Record<string, unknown> | null } = {
  value: betterAuthSession,
}

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: () => Promise.resolve(sessionState.value),
    },
  },
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: () => chain,
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const tx = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
    transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  sessionState.value = betterAuthSession
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe("GET /api/users/me", () => {
  it("401 when unauthenticated", async () => {
    sessionState.value = null
    const res = await getMe()
    expect(res.status).toBe(401)
  })

  it("returns current user profile", async () => {
    selectQueue.push([
      {
        id: "p1",
        role: "SUPER_ADMIN",
        phone: "123",
        isActive: true,
        tableRowsPerPage: 25,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
      [{ twoFactorEnabled: false }],
    ])
    const res = await getMe()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ id: "u1", name: "Test User" })
    expect(json.twoFactorRequired).toBe(false)
    expect(json.twoFactorEnabled).toBe(false)
  })

  it("admin gets twoFactorRequired when ADMIN_2FA_REQUIRED=1", async () => {
    vi.stubEnv("ADMIN_2FA_REQUIRED", "1")
    try {
      selectQueue.push(
        [
          {
            id: "p1",
            role: "SUPER_ADMIN",
            phone: "123",
            isActive: true,
            tableRowsPerPage: 20,
            warehouseId: null,
            merchantId: null,
            riderId: null,
          },
        ],
        [{ twoFactorEnabled: true }],
      )
      const res = await getMe()
      const json = await res.json()
      expect(json.twoFactorRequired).toBe(true)
      expect(json.twoFactorEnabled).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("merchant never gets twoFactorRequired but sees their own 2FA state", async () => {
    vi.stubEnv("ADMIN_2FA_REQUIRED", "1")
    try {
      selectQueue.push(
        [
          {
            id: "p1",
            role: "MERCHANT",
            phone: "123",
            isActive: true,
            tableRowsPerPage: 20,
            warehouseId: null,
            merchantId: "m1",
            riderId: null,
          },
        ],
        [{ emailVerifiedAt: null }],
        [{ twoFactorEnabled: true }],
      )
      const res = await getMe()
      const json = await res.json()
      expect(json.twoFactorRequired).toBe(false)
      expect(json.twoFactorEnabled).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("portalAllowed is false for a merchant on an admin-mode deployment", async () => {
    vi.stubEnv("PORTAL_MODE", "admin")
    try {
      selectQueue.push(
        [
          {
            id: "p1",
            role: "MERCHANT",
            phone: "123",
            isActive: true,
            tableRowsPerPage: 20,
            warehouseId: null,
            merchantId: "m1",
            riderId: null,
          },
        ],
        [{ emailVerifiedAt: null }],
        [{ twoFactorEnabled: false }],
      )
      const res = await getMe()
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json.portalAllowed).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("portalAllowed is true for an admin on an admin-mode deployment", async () => {
    vi.stubEnv("PORTAL_MODE", "admin")
    try {
      selectQueue.push(
        [
          {
            id: "p1",
            role: "SUPER_ADMIN",
            phone: "123",
            isActive: true,
            tableRowsPerPage: 25,
            warehouseId: null,
            merchantId: null,
            riderId: null,
          },
        ],
        [{ twoFactorEnabled: false }],
      )
      const res = await getMe()
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json.portalAllowed).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("portalAllowed is true for every role when PORTAL_MODE is unset", async () => {
    vi.stubEnv("PORTAL_MODE", undefined)
    try {
      selectQueue.push(
        [
          {
            id: "p1",
            role: "MERCHANT",
            phone: "123",
            isActive: true,
            tableRowsPerPage: 20,
            warehouseId: null,
            merchantId: "m1",
            riderId: null,
          },
        ],
        [{ emailVerifiedAt: null }],
        [{ twoFactorEnabled: false }],
      )
      const res = await getMe()
      const json = await res.json()
      expect(res.status).toBe(200)
      expect(json.portalAllowed).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("PATCH /api/users/me", () => {
  it("401 when unauthenticated", async () => {
    sessionState.value = null
    const res = await updateMe(req("PATCH", { name: "New Name" }))
    expect(res.status).toBe(401)
  })

  it("updates profile", async () => {
    updateResult.push({
      id: "u1",
      name: "Updated",
      updatedAt: new Date().toISOString(),
    })
    selectQueue.push([
      {
        id: "p1",
        role: "SUPER_ADMIN",
        phone: "123",
        isActive: true,
        tableRowsPerPage: 25,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await updateMe(req("PATCH", { name: "Updated" }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.name).toBe("Updated")
  })

  it("updates phone number", async () => {
    selectQueue.push([
      {
        id: "p1",
        role: "SUPER_ADMIN",
        phone: "01712345678",
        isActive: true,
        tableRowsPerPage: 25,
        warehouseId: null,
        merchantId: null,
        riderId: null,
      },
    ])
    const res = await updateMe(req("PATCH", { phone: "01712345678" }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.phone).toBe("01712345678")
  })
})
