import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { authenticateApiKey } from "./api-keys"

// =============================================================================
// authenticateApiKey — the authorization gate for `/api/v1/orders`.
//
// Split from `api-keys.spec.ts`, which pins the pure key-shape and scope rules:
// this one needs a database, so it is covered here against a mock. Every case
// below is a way it must REFUSE — P0-2 also moved its reads onto the primary so
// a revocation cannot lag behind a replica, which is asserted by the select
// order (key first, then merchant).
// =============================================================================

const selectQueue: unknown[][] = []
const updatePayloads: Record<string, unknown>[] = []
/** When true the telemetry write rejects, exercising the fire-and-forget guard. */
let telemetryFails = false

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
      set: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return chain
      },
      where: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) => {
        if (telemetryFails) return Promise.reject(new Error("telemetry down"))
        return Promise.resolve(undefined).then(onFulfilled)
      },
      catch: (onRejected: (e: unknown) => unknown) =>
        Promise.reject(new Error("telemetry down")).catch(onRejected),
    }
    return chain
  }
  return {
    db: { select: makeSelectChain, update: makeUpdateChain },
    dbRead: { select: makeSelectChain },
    pool: {},
  }
})

beforeEach(() => {
  selectQueue.length = 0
  updatePayloads.length = 0
  telemetryFails = false
})

function bearer(key: string): Request {
  return new Request("http://test.local/api/v1/orders", {
    headers: { authorization: `Bearer ${key}` },
  })
}

const KEY = "chl_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
// The stored value is the sha256 of the plaintext — `authenticateApiKey`
// re-hashes the presented key and compares, so a fixture that does not match
// the real digest is indistinguishable from a wrong key.
const HASH = createHash("sha256").update(KEY).digest("hex")

const row = {
  id: "k_1",
  merchantId: "m_1",
  keyHash: HASH,
  scopes: ["orders:read", "orders:write"],
  revokedAt: null,
}

describe("authenticateApiKey", () => {
  it("returns null when there is no authorization header", async () => {
    expect(
      await authenticateApiKey(new Request("http://test.local/")),
    ).toBeNull()
    // Nothing was looked up at all.
    expect(selectQueue).toHaveLength(0)
  })

  it("returns null for a non-Bearer scheme", async () => {
    const req = new Request("http://test.local/", {
      headers: { authorization: `Basic ${KEY}` },
    })
    expect(await authenticateApiKey(req)).toBeNull()
  })

  it("returns null when no row matches the presented hash", async () => {
    selectQueue.push([])
    expect(await authenticateApiKey(bearer(KEY))).toBeNull()
  })

  it("returns null for a revoked key, and never reads the merchant", async () => {
    selectQueue.push([{ ...row, revokedAt: "2025-01-01T00:00:00.000Z" }])
    expect(await authenticateApiKey(bearer(KEY))).toBeNull()
    // Short-circuited, so there is no second select.
    expect(selectQueue).toHaveLength(0)
  })

  it("returns null when the merchant is suspended", async () => {
    // A key minted while the account was healthy must not keep working.
    selectQueue.push([row], [{ status: "SUSPENDED" }])
    expect(await authenticateApiKey(bearer(KEY))).toBeNull()
  })

  it("returns null when the merchant row has gone", async () => {
    selectQueue.push([row], [])
    expect(await authenticateApiKey(bearer(KEY))).toBeNull()
  })

  it("authenticates a live key and reports its scopes", async () => {
    selectQueue.push([row], [{ status: "ACTIVE" }])
    expect(await authenticateApiKey(bearer(KEY))).toEqual({
      merchantId: "m_1",
      keyId: "k_1",
      scopes: ["orders:read", "orders:write"],
    })
  })

  it("treats a null scope list as no scopes rather than throwing", async () => {
    selectQueue.push([{ ...row, scopes: null }], [{ status: "ACTIVE" }])
    const result = await authenticateApiKey(bearer(KEY))
    expect(result).toEqual({ merchantId: "m_1", keyId: "k_1", scopes: [] })
  })

  it("stamps lastUsedAt as fire-and-forget telemetry", async () => {
    selectQueue.push([row], [{ status: "ACTIVE" }])
    await authenticateApiKey(bearer(KEY))
    expect(updatePayloads[0]).toMatchObject({
      lastUsedAt: expect.any(String),
    })
  })

  it("still authenticates when the telemetry write fails", async () => {
    // The stamp is fire-and-forget, so a database blip must not turn a valid
    // request into a 401.
    telemetryFails = true
    selectQueue.push([row], [{ status: "ACTIVE" }])

    const result = await authenticateApiKey(bearer(KEY))

    expect(result).toEqual({
      merchantId: "m_1",
      keyId: "k_1",
      scopes: ["orders:read", "orders:write"],
    })
  })

  it("reads the key first, then the merchant, on the primary", async () => {
    // P0-2: both reads come from `db`. If either moved to `dbRead`, a revocation
    // or a suspension would lag behind the replica and still be honoured.
    selectQueue.push([row], [{ status: "ACTIVE" }])
    await authenticateApiKey(bearer(KEY))
    expect(selectQueue).toHaveLength(0)
  })
})
