import { describe, expect, it, vi } from "vitest"
import {
  ACTIVATION_TTL_HOURS,
  accountStatus,
  activationUrl,
  generateActivationToken,
  hashActivationToken,
} from "./activation"

// The module imports the DB + mailer for the flows the API specs cover; this
// spec only exercises the pure helpers above.
vi.mock("@/lib/db", () => ({ db: {}, dbRead: {}, pool: {} }))
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn() }))

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
