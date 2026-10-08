import { describe, expect, it } from "vitest"
import {
  API_KEY_SCOPES,
  type AuthenticatedApiKey,
  generateApiKey,
  hasApiKeyScope,
  hashApiKey,
  isApiKeyScope,
} from "./api-keys"

// =============================================================================
// API keys (R2) — key shape, hashing, and scope semantics.
//
// `authenticateApiKey` needs a database, so it is covered by the integration
// suite; these pin the pure parts, which is where the security-relevant
// decisions actually live.
// =============================================================================

describe("generateApiKey", () => {
  it("produces a prefixed, high-entropy key", () => {
    const { plaintext, prefix } = generateApiKey("live")
    expect(plaintext).toMatch(/^chl_live_[A-Za-z0-9_-]{43}$/)
    // 32 bytes base64url is 43 characters — the prefix is only a display aid.
    expect(plaintext.slice("chl_live_".length)).toHaveLength(43)
    expect(prefix.startsWith("chl_live_")).toBe(true)
    expect(prefix.length).toBeLessThan(plaintext.length)
  })

  it("never repeats", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateApiKey("live").plaintext),
    )
    expect(seen.size).toBe(200)
  })

  it("separates test keys by label only, not by strength", () => {
    // The env segment is cosmetic. Both variants are equally random, so a
    // "test" key is not a weaker credential that should be treated differently.
    const test = generateApiKey("test")
    const live = generateApiKey("live")
    expect(test.plaintext).toMatch(/^chl_test_/)
    expect(live.plaintext).toMatch(/^chl_live_/)
    expect(test.plaintext).toHaveLength(live.plaintext.length)
  })

  it("returns the hash of the plaintext it just minted", () => {
    const { plaintext, hash } = generateApiKey()
    expect(hash).toBe(hashApiKey(plaintext))
    // The hash must not be the plaintext in any recoverable form.
    expect(hash).not.toContain(plaintext)
    expect(hash).toHaveLength(64) // sha256 hex
  })
})

describe("hashApiKey", () => {
  it("is deterministic, so a lookup can index on it", () => {
    expect(hashApiKey("chl_live_abc")).toBe(hashApiKey("chl_live_abc"))
  })

  it("separates near-identical keys", () => {
    expect(hashApiKey("chl_live_abc")).not.toBe(hashApiKey("chl_live_abd"))
  })
})

describe("isApiKeyScope", () => {
  it("accepts every declared scope", () => {
    for (const scope of API_KEY_SCOPES) {
      expect(isApiKeyScope(scope)).toBe(true)
    }
  })

  it("rejects anything undeclared — a typo must not become a live scope", () => {
    for (const bad of ["orders:*", "admin", "", null, undefined, 7]) {
      expect(isApiKeyScope(bad)).toBe(false)
    }
  })
})

describe("hasApiKeyScope", () => {
  const key = (scopes: string[]): AuthenticatedApiKey => ({
    merchantId: "MER-1",
    keyId: "k1",
    scopes,
  })

  it("grants exactly what the key holds", () => {
    const k = key(["orders:read", "orders:write"])
    expect(hasApiKeyScope(k, "orders:read")).toBe(true)
    expect(hasApiKeyScope(k, "orders:write")).toBe(true)
    expect(hasApiKeyScope(k, "webhooks:write")).toBe(false)
  })

  it("treats an empty scope list as read-nothing, not read-everything", () => {
    // The failure this prevents: a key created with no scopes silently
    // becoming a full-access credential.
    for (const scope of API_KEY_SCOPES) {
      expect(hasApiKeyScope(key([]), scope)).toBe(false)
    }
  })
})
