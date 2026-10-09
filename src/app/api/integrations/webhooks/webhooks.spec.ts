import { beforeEach, describe, expect, it, vi } from "vitest"
import { enqueueEmail, flushEmailOutbox } from "@/lib/email-outbox"
import { generateWebhookSecret, isWebhookEvent } from "@/lib/webhooks"
import { GET, POST } from "./route"

// =============================================================================
// POST /api/integrations/webhooks
//
// The only merchant-facing write on the R2 integration surface. The interesting
// contract is the cap: concurrent creates for one merchant used to race past
// MAX_WEBHOOKS_PER_MERCHANT because the count was read before the insert (P1-8),
// and a URL pointing at a private host used to be accepted (P1-5). Both are
// pinned below.
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

vi.mock("@/lib/webhooks", () => ({
  generateWebhookSecret: vi.fn(() => "whsec_fixed_for_test"),
  isWebhookEvent: vi.fn((e: string) => e.startsWith("order.")),
}))

// The enqueue + immediate flush the create route performs.
vi.mock("@/lib/email-outbox", () => ({
  enqueueEmail: vi.fn(() => Promise.resolve()),
  flushEmailOutbox: vi.fn(() => Promise.resolve()),
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
  vi.mocked(enqueueEmail).mockClear()
  vi.mocked(generateWebhookSecret).mockClear()
  vi.mocked(isWebhookEvent).mockClear()
})

function req(method: string, body?: unknown): Request {
  return new Request("http://test.local/api/integrations/webhooks", {
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

const VALID_URL = "https://hooks.example.com/receive"

describe("GET /api/integrations/webhooks", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("403 for a non-merchant", async () => {
    sessionState.value = adminSession
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns the merchant's endpoints", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "ep_1", url: VALID_URL }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      endpoints: [{ id: "ep_1", url: VALID_URL }],
    })
  })
})

describe("POST /api/integrations/webhooks", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req("POST", { url: VALID_URL }))
    expect(res.status).toBe(401)
  })

  it("403 for a non-merchant", async () => {
    sessionState.value = adminSession
    const res = await POST(req("POST", { url: VALID_URL }))
    expect(res.status).toBe(403)
  })

  it("400 on a missing body", async () => {
    sessionState.value = merchantSession
    const res = await POST(req("POST", {}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Invalid request body")
  })

  it("400 when the URL is not https", async () => {
    sessionState.value = merchantSession
    const res = await POST(req("POST", { url: "http://example.com/hook" }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it.each([
    ["loopback", "https://127.0.0.1/hook"],
    ["link-local metadata", "https://169.254.169.254/latest/meta-data"],
    ["RFC1918 private", "https://192.168.1.10/hook"],
    ["localhost", "https://localhost/hook"],
    ["an internal suffix", "https://db.internal/hook"],
  ])("400 when the URL targets %s", async (_label, url) => {
    sessionState.value = merchantSession
    const res = await POST(req("POST", { url }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("Invalid request body")
    // The reason is on the field, not swallowed into a generic message.
    expect(json.issues?.[0]?.path).toEqual(["url"])
    expect(json.issues?.[0]?.message).toContain("private or internal host")
    expect(insertPayloads).toHaveLength(0)
  })

  it("400 on an undeclared event name", async () => {
    sessionState.value = merchantSession
    const res = await POST(
      req("POST", { url: VALID_URL, events: ["order.nope"] }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    // `webhookEndpointCreateSchema` enumerates the nine declared events, so the
    // schema itself is the gate and a typo never reaches the handler.
    expect(json.error).toBe("Invalid request body")
    expect(json.issues?.[0]?.path).toEqual(["events", 0])
    expect(insertPayloads).toHaveLength(0)
  })

  it("creates the endpoint and returns the secret once", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 2 }])
    returningQueue.push([{ id: "ep_1", url: VALID_URL, events: [] }])

    const res = await POST(req("POST", { url: VALID_URL, events: [] }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json).toMatchObject({
      id: "ep_1",
      url: VALID_URL,
      secret: "whsec_fixed_for_test",
    })
    expect(insertPayloads[0]).toMatchObject({
      merchantId: "m_1",
      url: VALID_URL,
      secret: "whsec_fixed_for_test",
      events: [],
    })
  })

  it("trims the URL before storing it", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 0 }])
    returningQueue.push([{ id: "ep_1", url: VALID_URL, events: [] }])

    await POST(req("POST", { url: `  ${VALID_URL}  ` }))

    expect(insertPayloads[0]).toMatchObject({ url: VALID_URL })
  })

  it("defaults the subscription to all events when none is given", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 0 }])
    returningQueue.push([{ id: "ep_1", url: VALID_URL, events: [] }])

    await POST(req("POST", { url: VALID_URL }))

    // An empty list means "all events" — the same rule the drain reads.
    expect(insertPayloads[0]).toMatchObject({ events: [] })
  })

  it("400 once the merchant already holds the maximum number of endpoints", async () => {
    sessionState.value = merchantSession
    selectQueue.push([{ id: "m_1" }], [{ count: 10 }])

    const res = await POST(req("POST", { url: VALID_URL }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain("at most 10 webhook endpoints")
    // The cap is refused, not bypassed by a partial insert.
    expect(insertPayloads).toHaveLength(0)
  })

  it("404 when the merchant row cannot be locked (deleted mid-request)", async () => {
    sessionState.value = merchantSession
    selectQueue.push([]) // the lock select matches nothing

    const res = await POST(req("POST", { url: VALID_URL }))

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Merchant not found")
  })
})
