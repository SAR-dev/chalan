import { describe, expect, it } from "vitest"
import {
  hashVerifyToken,
  issueVerifyToken,
  VERIFY_TOKEN_TTL_HOURS,
  verifyTokenUrl,
} from "@/lib/verify-token"

describe("hashVerifyToken", () => {
  it("is a stable sha256 hex digest", () => {
    const hash = hashVerifyToken("raw-token")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashVerifyToken("raw-token"))
  })

  it("never returns the raw token", () => {
    const raw =
      "6f1d2b8e0c4a5f6e7d8c9b0a1e2f3a4b5c6d7e8f90112233445566778899aabb"
    const hash = hashVerifyToken(raw)
    expect(hash).not.toContain(raw)
    expect(hash).not.toContain(raw.slice(0, 8))
  })

  it("distinguishes different tokens", () => {
    expect(hashVerifyToken("a")).not.toBe(hashVerifyToken("b"))
  })
})

describe("issueVerifyToken", () => {
  it("returns a raw token plus its stored hash", () => {
    const issued = issueVerifyToken()
    expect(issued.raw).toMatch(/^[0-9a-f]{64}$/)
    expect(issued.hash).toBe(hashVerifyToken(issued.raw))
  })
  it("expires in 24 hours", () => {
    const before = Date.now()
    const issued = issueVerifyToken()
    const ttlMs = new Date(issued.expiresAt).getTime() - before
    const ttl = VERIFY_TOKEN_TTL_HOURS * 3600_000
    expect(VERIFY_TOKEN_TTL_HOURS).toBe(24)
    // `before` is sampled a moment before the token is issued, so allow a
    // couple of milliseconds of slack in both directions.
    expect(ttlMs).toBeGreaterThan(ttl - 2_000)
    expect(ttlMs).toBeLessThanOrEqual(ttl + 2_000)
  })

  it("issues a unique token each time", () => {
    const raws = new Set(
      Array.from({ length: 25 }, () => issueVerifyToken().raw),
    )
    expect(raws.size).toBe(25)
  })
})

describe("verifyTokenUrl", () => {
  it("puts only the raw token in the URL", () => {
    const { raw, hash } = issueVerifyToken()
    const url = verifyTokenUrl(raw, "https://app.example.com")
    expect(url).toBe(
      `https://app.example.com/api/auth/verify-email?token=${raw}`,
    )
    expect(url).not.toContain(hash)
  })

  it("falls back to the site env var", () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = "https://kikuya.example.com"
    try {
      expect(verifyTokenUrl("tok")).toBe(
        "https://kikuya.example.com/api/auth/verify-email?token=tok",
      )
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = previous
    }
  })
})
