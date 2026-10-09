import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  drainWebhooks,
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
//
// `drainWebhooks` gets its own section below. It is the only place in the app
// that makes an outbound request to a merchant-supplied URL, so its network
// path (non-2xx, timeout, private-host refusal, failure threshold) is the part
// a mocked-away integration would never exercise — which is exactly how the
// SSRF gap survived.
// =============================================================================

// `drainWebhooks` only touches the `db` handle it is given for the claim/heartbeat
// reads and writes; the row data is scripted through the select queue below and
// every write is captured, so the branch logic under test is real.
const selectQueue: unknown[][] = []
const updatePayloads: Record<string, unknown>[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      // `.for("update", …)` is a no-op in tests; the lock is the database's job.
      for: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return chain
      },
      where: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(undefined).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => makeUpdateChain(),
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db, dbRead: { ...db }, pool: {} }
})

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

// =============================================================================
// drainWebhooks — the outbound network path.
//
// The claim phase reads in a fixed order (claim rows, then the endpoint for
// each row, then — on a failure that must increment the counter — the locked
// endpoint row), so the select queue mirrors that sequence exactly.
// =============================================================================

const ENDPOINT = {
  id: "ep_1",
  merchantId: "m_1",
  url: "https://hooks.example.com/receive",
  secret: "whsec_endpoint",
  events: [],
  isActive: true,
  failureCount: 0,
  disabledAt: null,
  lastDeliveredAt: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
}

const DELIVERY = {
  id: "del_1",
  endpointId: "ep_1",
  merchantId: "m_1",
  event: "order.created",
  eventId: "evt_1",
  payload: { id: "o_1" },
  status: "PENDING",
  attempts: 0,
  lastError: null,
  deliveredAt: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
}

/** The delivery-row writes, in order, out of everything drainWebhooks writes. */
function deliveryWrites() {
  return updatePayloads.filter((p) => "status" in p && !("failureCount" in p))
}

/** The endpoint writes (delivery rows never carry `failureCount`). */
function endpointWrites() {
  return updatePayloads.filter((p) =>
    ["failureCount", "lastDeliveredAt", "isActive", "disabledAt"].some(
      (k) => k in p,
    ),
  )
}

const fetchMock = vi.fn()

beforeEach(() => {
  selectQueue.length = 0
  updatePayloads.length = 0
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("drainWebhooks", () => {
  /**
   * Push the reads a delivery makes: the claimed rows, the endpoint for the
   * row, and — when the delivery will fail and must bump the counter — the
   * endpoint row re-read under the lock.
   */
  async function claimOne({
    endpoint = {},
    lockedFailureCount,
  }: {
    endpoint?: Record<string, unknown>
    lockedFailureCount?: number
  } = {}) {
    selectQueue.push([DELIVERY], [{ ...ENDPOINT, ...endpoint }])
    if (lockedFailureCount !== undefined) {
      selectQueue.push([{ failureCount: lockedFailureCount }])
    }
  }

  it("delivers on a 2xx and resets the endpoint failure counter", async () => {
    await claimOne({ endpoint: { failureCount: 4 } })
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    const result = await drainWebhooks()

    expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0 })
    expect(deliveryWrites().at(-1)).toMatchObject({
      status: "DELIVERED",
      attempts: 1,
    })
    // A success clears the counter whatever it was.
    expect(endpointWrites().at(-1)).toMatchObject({ failureCount: 0 })
    // The receiver gets the signature headers it needs to trust the body.
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT.url,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-chalan-event": "order.created",
          "x-chalan-signature": expect.stringMatching(/^v1=[0-9a-f]{64}$/),
        }),
      }),
    )
  })

  it("parks the delivery and increments the counter on a non-2xx", async () => {
    await claimOne({ endpoint: { failureCount: 0 }, lockedFailureCount: 0 })
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    const result = await drainWebhooks()

    expect(result).toMatchObject({ delivered: 0, failed: 1 })
    expect(deliveryWrites().at(-1)).toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastError: "HTTP 500",
    })
    expect(endpointWrites().at(-1)).toMatchObject({ failureCount: 1 })
  })

  it("auto-disables the endpoint once the threshold is reached", async () => {
    await claimOne({
      endpoint: { failureCount: WEBHOOK_FAILURE_THRESHOLD - 1 },
      lockedFailureCount: WEBHOOK_FAILURE_THRESHOLD - 1,
    })
    fetchMock.mockRejectedValue(new Error("socket hang up"))

    const result = await drainWebhooks()

    expect(result).toMatchObject({ failed: 1, disabled: 1 })
    expect(endpointWrites().at(-1)).toMatchObject({
      failureCount: WEBHOOK_FAILURE_THRESHOLD,
      isActive: false,
      disabledAt: expect.any(String),
    })
    // A receiver that hangs must not stall the drain.
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT.url,
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it("increments from the locked row, not the stale snapshot read before the fetch", async () => {
    // The endpoint was read before the request went out (failureCount 5), but a
    // concurrent drain has since landed more failures on the same endpoint. The
    // locked re-read is the only value that is current; using the snapshot would
    // silently rewind the counter and delay auto-disable past the threshold.
    await claimOne({
      endpoint: { failureCount: 5 },
      lockedFailureCount: 9,
    })
    fetchMock.mockRejectedValue(new Error("timeout"))

    await drainWebhooks()

    expect(endpointWrites().at(-1)).toMatchObject({ failureCount: 10 })
  })

  it("refuses a private or internal target without making the request", async () => {
    // The URL was swapped to a private host after the claim, so the guard runs
    // at delivery time rather than only at create time.
    selectQueue.push(
      [DELIVERY],
      [{ ...ENDPOINT, url: "https://127.0.0.1:9000/receive" }],
    )
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    const result = await drainWebhooks()

    expect(result).toMatchObject({ delivered: 0, failed: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deliveryWrites().at(-1)).toMatchObject({
      status: "FAILED",
      lastError: expect.stringContaining("private or internal host"),
    })
  })

  it("does not follow redirects — a public URL must not be a redirect to a private one", async () => {
    await claimOne()
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    await drainWebhooks()

    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT.url,
      expect.objectContaining({ redirect: "manual" }),
    )
  })

  it("parks the delivery without a request when the URL is not parseable", async () => {
    selectQueue.push([DELIVERY], [{ ...ENDPOINT, url: "not-a-url" }])
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    const result = await drainWebhooks()

    expect(result).toMatchObject({ delivered: 0, failed: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deliveryWrites().at(-1)).toMatchObject({
      status: "FAILED",
      lastError: "Invalid endpoint URL",
    })
  })

  it("parks the delivery when the endpoint no longer exists", async () => {
    selectQueue.push([DELIVERY], [])
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    const result = await drainWebhooks()

    expect(result).toMatchObject({ delivered: 0, failed: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deliveryWrites().at(-1)).toMatchObject({
      status: "FAILED",
      lastError: "Endpoint no longer exists",
    })
  })

  it("recovers rows a dead worker left mid-send", async () => {
    selectQueue.push([]) // nothing to claim

    await drainWebhooks()

    // The first write of any drain is the stale-SENDING recovery.
    expect(updatePayloads[0]).toMatchObject({ status: "PENDING" })
  })
})
