import { beforeEach, describe, expect, it, vi } from "vitest"

let sessionResult: { user: { id: string } } | null = null
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
    where: () => makeChain(result),
    limit: () => ({
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled),
    }),
  })
  return {
    db: {
      select: () => makeChain(dbResult !== null ? [dbResult] : []),
    },
  }
})

vi.mock("@/lib/db/schema", () => ({
  profile: {},
  user: {},
}))

describe("requireSession", () => {
  beforeEach(() => {
    sessionResult = null
    dbResult = null
  })

  it("returns profile when session exists", async () => {
    sessionResult = { user: { id: "u1" } }
    dbResult = { userId: "u1", role: "MERCHANT", name: "Test Merchant" }
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
})
