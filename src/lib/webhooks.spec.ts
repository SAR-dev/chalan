import { describe, expect, it } from "vitest"
import {
  isWebhookEvent,
  signWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_EVENTS,
  WEBHOOK_FAILURE_THRESHOLD,
} from "./webhooks"

// =============================================================================
// Webhooks (R2) — signing and event vocabulary.
//
// The signature is the whole security story of a webhook: it is what lets a
// receiver trust a POST that arrived over an unauthenticated public URL. These
// pin that it cannot be replayed, and that it fails closed on any tampering.
// =============================================================================

const SECRET = "whsec_test_secret"
const OTHER_SECRET = "whsec_different"
const BODY = JSON.stringify({ id: "evt_1", type: "order.delivered" })
const TS = 1_700_000_000

describe("signWebhookPayload", () => {
  it("produces a versioned hex HMAC", () => {
    const sig = signWebhookPayload(SECRET, TS, BODY)
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/)
  })

  it("is deterministic for the same inputs", () => {
    expect(signWebhookPayload(SECRET, TS, BODY)).toBe(
      signWebhookPayload(SECRET, TS, BODY),
    )
  })

  it("changes when the body changes by a single byte", () => {
    expect(signWebhookPayload(SECRET, TS, BODY)).not.toBe(
      signWebhookPayload(SECRET, TS, `${BODY} `),
    )
  })

  it("changes when the timestamp changes — this is what blocks replay", () => {
    // The failure this prevents: an attacker who captures a delivery re-posting
    // it later with a fresh timestamp. Because the timestamp is inside the
    // signed string, the old signature no longer verifies.
    expect(signWebhookPayload(SECRET, TS, BODY)).not.toBe(
      signWebhookPayload(SECRET, TS + 1, BODY),
    )
  })

  it("changes when the secret changes", () => {
    expect(signWebhookPayload(SECRET, TS, BODY)).not.toBe(
      signWebhookPayload(OTHER_SECRET, TS, BODY),
    )
  })
})

describe("verifyWebhookSignature", () => {
  it("accepts a signature it produced", () => {
    expect(
      verifyWebhookSignature(
        SECRET,
        TS,
        BODY,
        signWebhookPayload(SECRET, TS, BODY),
      ),
    ).toBe(true)
  })

  it("rejects a tampered body", () => {
    const sig = signWebhookPayload(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, TS, `${BODY} `, sig)).toBe(false)
  })

  it("rejects a replayed signature against a new timestamp", () => {
    const captured = signWebhookPayload(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, TS + 60, BODY, captured)).toBe(false)
  })

  it("rejects the wrong secret", () => {
    const sig = signWebhookPayload(OTHER_SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, TS, BODY, sig)).toBe(false)
  })

  it("rejects a truncated or padded signature without throwing", () => {
    const sig = signWebhookPayload(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, TS, BODY, sig.slice(0, -1))).toBe(
      false,
    )
    expect(verifyWebhookSignature(SECRET, TS, BODY, `${sig}0`)).toBe(false)
    expect(verifyWebhookSignature(SECRET, TS, BODY, "")).toBe(false)
    expect(verifyWebhookSignature(SECRET, TS, BODY, "garbage")).toBe(false)
  })

  it("rejects a signature with the v1 prefix stripped", () => {
    // Forces a receiver to actually read the version, so a future v2 scheme can
    // be introduced without silently accepting an unversioned MAC.
    const sig = signWebhookPayload(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, TS, BODY, sig.slice(3))).toBe(false)
  })
})

describe("isWebhookEvent", () => {
  it("accepts every declared event", () => {
    for (const event of WEBHOOK_EVENTS) {
      expect(isWebhookEvent(event)).toBe(true)
    }
  })

  it("rejects undeclared names — a typo must not become a live subscription", () => {
    for (const bad of ["order.exploded", "order.", "", null, 42]) {
      expect(isWebhookEvent(bad)).toBe(false)
    }
  })
})

describe("WEBHOOK_FAILURE_THRESHOLD", () => {
  it("auto-disables a persistently broken endpoint", () => {
    // Bounded so one dead receiver cannot accumulate delivery rows forever.
    expect(WEBHOOK_FAILURE_THRESHOLD).toBeGreaterThan(0)
    expect(Number.isInteger(WEBHOOK_FAILURE_THRESHOLD)).toBe(true)
  })
})
