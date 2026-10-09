import { beforeEach, describe, expect, it, vi } from "vitest"
import { generateApiKey } from "@/lib/api-keys"
import { GET, POST } from "./route"

// =============================================================================
// POST /api/integrations/api-keys
//
// The cap is the contract that matters: concurrent creates for one merchant used
// to race past MAX_KEYS_PER_MERCHANT because the count was read before the
// insert with no lock (P1-8). The secret is returned exactly once, so the
// response shape is pinned too.
// =============================================================================

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByIp: () => null,
  rateLimit: () => null,
  getClientIp: () => "127.0.0.1",
}))

vi.mock("@/lib/api-keys", () => ({
  generateApiKey: vi.fn((_env: string) => ({
    plaintext: "chl_live_plaintext_for_test",
    hash: "sha256_hash",
    prefix: "chl_live_abcd",
  })),
  isApiKeyScope: vi.fn((s: string) => s.startsWith("orders:")),
  API_KEY_SCOPES: ["orders:read", "orders:write"],
}))

const selectQueue: unknown[][] = []
const returningQueue: unknown[][] = []
const insertPayloads: Record<string, unknown>[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
      for: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload)
        return chain
      },
      onConflictDoUpdate: () => chain,
      returning: () => Promise.resolve(returningQueue.shift() ?? []),
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(undefined).then(onFulfilled),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => ({ set: () => ({ where: () => ({}) }) }),
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  returningQueue.length = 0
  insertPayloads.length = 0
  sessionState.value = null
  vi.mocked(generateApiKey).mockClear()
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api/integrations/api-keys", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u2",
  merchantId: "m_1",
}
const adminSession = { role: "SUPER_ADMIN", name: "Admin Amy", userId: "u1" }

describe("GET /api/integrations/api-keys", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("403 for a non-merchant", async () => {
    sessionState.value = adminSession
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns the merchant's keys", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "k_1", label: "Production" }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      keys: [{ id: "k_1", label: "Production" }],
    })
  })
})

describe("POST /api/integrations/api-keys", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req("POST", { label: "Prod" }))
    expect(res.status).toBe(401)
  })

  it("403 for a non-merchant", async () => {
    sessionState.value = adminSession
    const res = await POST(req("POST", { label: "Prod" }))
    expect(res.status).toBe(403)
  })

  it("400 on a missing body", async () => {
    sessionState.value = merchantSession
    const res = await POST(req("POST", {}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Invalid request body")
  })

  it("400 on an undeclared scope", async () => {
    sessionState.value = merchantSession
    const res = await POST(req("POST", { label: "Prod", scopes: ["nope"] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    // The schema enumerates the scopes, so a typo never reaches the handler.
    expect(json.error).toBe("Invalid request body")
    expect(json.issues?.[0]?.path).toEqual(["scopes", 0])
    expect(insertPayloads).toHaveLength(0)
  })

  it("creates the key, stores only the hash, and returns the secret once", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 0 }])
    returningQueue.push([{ id: "k_1" }])

    const res = await POST(
      req("POST", { label: "Production", scopes: ["orders:write"] }),
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json).toMatchObject({
      id: "k_1",
      plaintext: "chl_live_plaintext_for_test",
      prefix: "chl_live_abcd",
    })
    // The plaintext is never persisted — only its hash.
    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      label: "Production",
      prefix: "chl_live_abcd",
      keyHash: "sha256_hash",
      scopes: ["orders:write"],
    })
    expect(insertPayloads[0]).not.toHaveProperty("plaintext")
  })

  it("defaults to the live environment when none is given", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 0 }])
    returningQueue.push([{ id: "k_1" }])

    await POST(req("POST", { label: "Production", scopes: ["orders:read"] }))

    expect(vi.mocked(generateApiKey)).toHaveBeenCalledWith("live")
  })

  it("honours an explicit test environment", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 0 }])
    returningQueue.push([{ id: "k_1" }])

    await POST(
      req("POST", {
        label: "Staging",
        scopes: ["orders:read"],
        environment: "test",
      }),
    )

    expect(vi.mocked(generateApiKey)).toHaveBeenCalledWith("test")
  })

  it("trims the label before storing it", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 0 }])
    returningQueue.push([{ id: "k_1" }])

    const res = await POST(
      req("POST", { label: "  Production  ", scopes: ["orders:write"] }),
    )

    expect(insertPayloads[0]).toMatchObject({ label: "Production" })
    expect(await res.json()).toMatchObject({ label: "Production" })
  })

  it("400 once the merchant already holds the maximum number of keys", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 10 }])

    const res = await POST(
      req("POST", { label: "Production", scopes: ["orders:read"] }),
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain("at most 10 API keys")
    expect(insertPayloads).toHaveLength(0)
  })

  it("404 when the merchant row cannot be locked (deleted mid-request)", async () => {
    sessionState.value = merchantSession
    selectQueue.push([]) // the lock select matches nothing

    const res = await POST(
      req("POST", { label: "Production", scopes: ["orders:read"] }),
    )

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Merchant not found")
  })
})
