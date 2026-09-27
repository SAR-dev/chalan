import { describe, expect, it } from "vitest"
import {
  generateTrackingToken,
  trackingTokensMatch,
} from "@/lib/tracking-token"

describe("generateTrackingToken", () => {
  it("returns 32 lowercase hex characters", () => {
    expect(generateTrackingToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateTrackingToken))
    expect(tokens.size).toBe(200)
  })
})

describe("trackingTokensMatch", () => {
  it("matches an identical token", () => {
    const token = generateTrackingToken()
    expect(trackingTokensMatch(token, token)).toBe(true)
  })

  it("rejects a different token of the same length", () => {
    const token = generateTrackingToken()
    const other = generateTrackingToken()
    expect(trackingTokensMatch(token, other)).toBe(false)
  })

  it("rejects a length mismatch", () => {
    expect(trackingTokensMatch("a".repeat(32), "a".repeat(31))).toBe(false)
    expect(trackingTokensMatch("a".repeat(32), "")).toBe(false)
  })

  it("rejects a missing stored token", () => {
    expect(trackingTokensMatch(null, "a".repeat(32))).toBe(false)
    expect(trackingTokensMatch(undefined, "a".repeat(32))).toBe(false)
  })
})
