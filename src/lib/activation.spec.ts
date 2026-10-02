import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  ACTIVATION_TTL_HOURS,
  accountStatus,
  activationUrl,
  generateActivationToken,
  hashActivationToken,
  lockModeratorQuota,
  ModeratorQuotaError,
} from "./activation"

// The module imports the DB + mailer for the flows the API specs cover; this
// spec only exercises the pure helpers above plus the quota lock.
const dbState = vi.hoisted(() => ({
  /** Rows returned by each select, in call order. */
  selectQueue: [] as unknown[][],
  /** Clauses passed to `.for(...)`, in call order. */
  forCalls: [] as string[],
  /** A stand-in transaction handle backed by the mocked chain. */
  makeTx: null as unknown,
}))

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      for: (strength: string) => {
        dbState.forCalls.push(strength)
        return chain
      },
      set: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(dbState.selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  dbState.makeTx = { select: () => makeSelectChain() }
  return {
    db: { select: () => makeSelectChain(), update: () => makeSelectChain() },
    dbRead: {},
    pool: {},
  }
})
vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn(),
  toPlainText: (html: string) => html.replace(/<[^>]+>/g, ""),
}))

describe("hashActivationToken", () => {
  it("is a stable SHA-256 hex digest", () => {
    const hash = hashActivationToken("abc123")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashActivationToken("abc123")).toBe(hash)
    expect(hashActivationToken("abc124")).not.toBe(hash)
  })
})

describe("generateActivationToken", () => {
  it("returns a raw token, matching hash, and ~24h expiry", () => {
    const { raw, hash, expiresAt } = generateActivationToken()
    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashActivationToken(raw))
    const ttlMs = expiresAt.getTime() - Date.now()
    expect(ttlMs).toBeGreaterThan(ACTIVATION_TTL_HOURS * 3600_000 - 60_000)
    expect(ttlMs).toBeLessThanOrEqual(ACTIVATION_TTL_HOURS * 3600_000)
  })

  it("never repeats a raw token", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateActivationToken().raw),
    )
    expect(tokens.size).toBe(50)
  })

  it("only exposes the hash for storage", () => {
    const { raw, hash } = generateActivationToken()
    expect(hash).not.toBe(raw)
    expect(hash.includes(raw)).toBe(false)
  })
})

describe("activationUrl", () => {
  it("builds the /activate page URL with the encoded token", () => {
    expect(activationUrl("tok en", "https://example.com")).toBe(
      "https://example.com/activate?token=tok%20en",
    )
  })

  it("falls back to localhost when no site URL is given", () => {
    expect(activationUrl("t")).toContain("/activate?token=t")
  })
})

describe("lockModeratorQuota", () => {
  const tx = () => dbState.makeTx as Parameters<typeof lockModeratorQuota>[0]

  beforeEach(() => {
    dbState.selectQueue.length = 0
    dbState.forCalls.length = 0
  })

  it("takes a row lock on the merchant before counting", async () => {
    dbState.selectQueue.push([{ maxModerators: 5 }], [{ userId: "u1" }])
    const quota = await lockModeratorQuota(tx(), "MER-1")
    expect(quota).toEqual({ maxModerators: 5, used: 1 })
    // The lock is what makes the count-then-write atomic.
    expect(dbState.forCalls).toEqual(["update"])
  })

  it("throws ModeratorQuotaError with the used/max numbers when full", async () => {
    dbState.selectQueue.push(
      [{ maxModerators: 2 }],
      [{ userId: "u1" }, { userId: "u2" }],
    )
    const err = await lockModeratorQuota(tx(), "MER-1").catch((e) => e)
    expect(err).toBeInstanceOf(ModeratorQuotaError)
    expect(err.used).toBe(2)
    expect(err.max).toBe(2)
  })

  it("returns null when the merchant no longer exists", async () => {
    dbState.selectQueue.push([])
    expect(await lockModeratorQuota(tx(), "MER-GONE")).toBeNull()
  })

  it("counts a 0-slot quota as full", async () => {
    dbState.selectQueue.push([{ maxModerators: 0 }], [])
    await expect(lockModeratorQuota(tx(), "MER-1")).rejects.toBeInstanceOf(
      ModeratorQuotaError,
    )
  })
})

describe("accountStatus", () => {
  it("maps the three lifecycle states", () => {
    expect(accountStatus({ isActive: true, activatedAt: null })).toBe("ACTIVE")
    expect(accountStatus({ isActive: false, activatedAt: null })).toBe(
      "PENDING",
    )
    expect(accountStatus({ isActive: false, activatedAt: "2026-01-01" })).toBe(
      "DEACTIVATED",
    )
  })

  it("ACTIVE wins even with a stale activatedAt", () => {
    expect(accountStatus({ isActive: true, activatedAt: "2026-01-01" })).toBe(
      "ACTIVE",
    )
  })
})
