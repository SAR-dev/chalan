import { beforeEach, describe, expect, it, vi } from "vitest"

let sessionResult: {
  user: { id: string }
  session?: { impersonatedBy?: string | null }
} | null = null
let dbResult: Record<string, unknown> | null = null

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: () => Promise.resolve(sessionResult),
    },
  },
}))

vi.mock("@/lib/db", () => {
  const makeChain = (result: unknown) => ({
    from: () => makeChain(result),
    innerJoin: () => makeChain(result),
    leftJoin: () => makeChain(result),
    where: () => makeChain(result),
    limit: () => ({
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled),
    }),
  })
  const dbMock = {
    select: () => makeChain(dbResult !== null ? [dbResult] : []),
  }
  return {
    db: dbMock,
    // Session resolution reads through the read pool.
    dbRead: dbMock,
  }
})

vi.mock("@/lib/db/schema", () => ({
  profile: {},
  user: {},
  merchant: {},
}))

describe("requireSession", () => {
  beforeEach(() => {
    sessionResult = null
    dbResult = null
  })

  it("returns profile when session exists", async () => {
    sessionResult = { user: { id: "u1" } }
    dbResult = {
      userId: "u1",
      role: "MERCHANT",
      name: "Test Merchant",
      emailVerifiedAt: "2025-01-01T00:00:00Z",
    }
    const { requireSession } = await import("@/lib/api-auth")
    const result = await requireSession()
    expect(result).not.toBeNull()
    expect(result!.userId).toBe("u1")
    expect(result!.role).toBe("MERCHANT")
  })

  it("returns null when no session", async () => {
    sessionResult = null
    const { requireSession } = await import("@/lib/api-auth")
    const result = await requireSession()
    expect(result).toBeNull()
  })

  it("returns null when DB returns no rows", async () => {
    sessionResult = { user: { id: "u2" } }
    dbResult = null
    const { requireSession } = await import("@/lib/api-auth")
    const result = await requireSession()
    expect(result).toBeNull()
  })

  it("returns null when the role is outside PORTAL_MODE", async () => {
    vi.stubEnv("PORTAL_MODE", "admin")
    try {
      sessionResult = { user: { id: "u3" } }
      dbResult = { userId: "u3", role: "MERCHANT", name: "Blocked Merchant" }
      const { requireSession } = await import("@/lib/api-auth")
      const result = await requireSession()
      expect(result).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("returns the profile when the role is inside PORTAL_MODE", async () => {
    vi.stubEnv("PORTAL_MODE", "public")
    try {
      sessionResult = { user: { id: "u4" } }
      dbResult = { userId: "u4", role: "RIDER", name: "Allowed Rider" }
      const { requireSession } = await import("@/lib/api-auth")
      const result = await requireSession()
      expect(result).not.toBeNull()
      expect(result!.role).toBe("RIDER")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("keeps every role allowed when PORTAL_MODE is unset (all)", async () => {
    vi.stubEnv("PORTAL_MODE", undefined)
    try {
      sessionResult = { user: { id: "u5" } }
      dbResult = { userId: "u5", role: "SUPER_ADMIN", name: "Admin" }
      const { requireSession } = await import("@/lib/api-auth")
      const result = await requireSession()
      expect(result).not.toBeNull()
      expect(result!.role).toBe("SUPER_ADMIN")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  // --- Policy gates that used to be browser-only ---------------
  describe("server-side policy gates", () => {
    it("returns null for a banned user", async () => {
      sessionResult = { user: { id: "u6" } }
      dbResult = { userId: "u6", role: "RIDER", name: "Banned", banned: true }
      const { requireSession } = await import("@/lib/api-auth")
      expect(await requireSession()).toBeNull()
    })

    it("returns null for an admin who has not enrolled while the policy is on", async () => {
      vi.stubEnv("ADMIN_2FA_REQUIRED", "1")
      try {
        sessionResult = { user: { id: "u7" } }
        dbResult = {
          userId: "u7",
          role: "SUPER_ADMIN",
          name: "Unenrolled",
          twoFactorEnabled: false,
        }
        const { requireSession } = await import("@/lib/api-auth")
        expect(await requireSession()).toBeNull()
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it("allows an enrolled admin while the policy is on", async () => {
      vi.stubEnv("ADMIN_2FA_REQUIRED", "1")
      try {
        sessionResult = { user: { id: "u8" } }
        dbResult = {
          userId: "u8",
          role: "SUPER_ADMIN",
          name: "Enrolled",
          twoFactorEnabled: true,
        }
        const { requireSession } = await import("@/lib/api-auth")
        expect(await requireSession()).not.toBeNull()
      } finally {
        vi.unstubAllEnvs()
      }
    })

    it("returns null for an unverified merchant", async () => {
      sessionResult = { user: { id: "u9" } }
      dbResult = {
        userId: "u9",
        role: "MERCHANT",
        name: "Unverified",
        emailVerifiedAt: null,
      }
      const { requireSession } = await import("@/lib/api-auth")
      expect(await requireSession()).toBeNull()
    })

    it("the account-state variant still returns a policy-blocked session", async () => {
      sessionResult = { user: { id: "u10" } }
      dbResult = {
        userId: "u10",
        role: "MERCHANT",
        name: "Unverified",
        emailVerifiedAt: null,
      }
      const { requireSessionForAccountState } = await import("@/lib/api-auth")
      const result = await requireSessionForAccountState()
      expect(result).not.toBeNull()
      expect(result!.role).toBe("MERCHANT")
    })

    it("surfaces the impersonating admin on the session", async () => {
      sessionResult = {
        user: { id: "u11" },
        session: { impersonatedBy: "admin_1" },
      }
      dbResult = {
        userId: "u11",
        role: "MERCHANT",
        name: "Impersonated",
        emailVerifiedAt: "2025-01-01T00:00:00Z",
      }
      const { requireSession } = await import("@/lib/api-auth")
      const result = await requireSession()
      expect(result?.impersonatedBy).toBe("admin_1")
    })
  })
})
