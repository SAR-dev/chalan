import { beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH } from "./route"

const state = vi.hoisted(() => ({
  rateLimited: null as unknown,
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByIp: () => Promise.resolve(state.rateLimited),
}))

const dbState = vi.hoisted(() => {
  const selectQueue: unknown[][] = []
  const updatePayloads: Record<string, unknown>[] = []
  return { selectQueue, updatePayloads }
})

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(dbState.selectQueue.shift() ?? []),
    }
    return chain
  }
  const db = {
    select: () => makeSelectChain(),
    update: () => {
      const chain: Record<string, unknown> = {
        set: (vals: Record<string, unknown>) => {
          dbState.updatePayloads.push(vals)
          return chain
        },
        where: () => Promise.resolve([]),
      }
      return chain
    },
  }
  return { db, dbRead: db, pool: {} }
})

const TOKEN = "a".repeat(32)

beforeEach(() => {
  dbState.selectQueue.length = 0
  dbState.updatePayloads.length = 0
  state.rateLimited = null
})

function req(body: unknown): Request {
  return new Request("http://test.local/api/orders/ORD-1/receiver-note", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function ctx(id = "ORD-1") {
  return { params: Promise.resolve({ id }) }
}

describe("PATCH /api/orders/[id]/receiver-note", () => {
  it("429 when rate limited", async () => {
    state.rateLimited = new Response(null, { status: 429 })
    const res = await PATCH(req({ receiverNote: "hi", token: TOKEN }), ctx())
    expect(res.status).toBe(429)
  })

  it("400 when the token is missing from the body", async () => {
    const res = await PATCH(req({ receiverNote: "hi" }), ctx())
    expect(res.status).toBe(400)
    expect(dbState.updatePayloads).toHaveLength(0)
  })

  it("400 when the note is empty", async () => {
    const res = await PATCH(req({ receiverNote: "", token: TOKEN }), ctx())
    expect(res.status).toBe(400)
  })

  it("404 for an unknown order", async () => {
    dbState.selectQueue.push([])
    const res = await PATCH(req({ receiverNote: "hi", token: TOKEN }), ctx())
    expect(res.status).toBe(404)
  })

  it("404 for a wrong token (no existence oracle)", async () => {
    dbState.selectQueue.push([
      { id: "ORD-1", status: "PENDING", trackingToken: TOKEN },
    ])
    const res = await PATCH(
      req({ receiverNote: "hi", token: "b".repeat(32) }),
      ctx(),
    )
    expect(res.status).toBe(404)
    expect(dbState.updatePayloads).toHaveLength(0)
  })

  it("404 when the order has no token (legacy row)", async () => {
    dbState.selectQueue.push([
      { id: "ORD-1", status: "PENDING", trackingToken: null },
    ])
    const res = await PATCH(req({ receiverNote: "hi", token: TOKEN }), ctx())
    expect(res.status).toBe(404)
  })

  it("409 for a terminal order even with the right token", async () => {
    dbState.selectQueue.push([
      { id: "ORD-1", status: "DELIVERED", trackingToken: TOKEN },
    ])
    const res = await PATCH(req({ receiverNote: "hi", token: TOKEN }), ctx())
    expect(res.status).toBe(409)
    expect(dbState.updatePayloads).toHaveLength(0)
  })

  it("saves the note and returns no order PII", async () => {
    dbState.selectQueue.push([
      { id: "ORD-1", status: "PENDING", trackingToken: TOKEN },
    ])
    const res = await PATCH(
      req({ receiverNote: "  ring twice  ", token: TOKEN }),
      ctx(),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    // Regression guard: the public response must never carry order fields.
    expect(json).not.toHaveProperty("recipientName")
    expect(json).not.toHaveProperty("recipientPhone")
    expect(json).not.toHaveProperty("deliveryAddress")
    expect(json).not.toHaveProperty("productCost")
    expect(dbState.updatePayloads[0]).toMatchObject({
      receiverNote: "ring twice",
    })
  })
})
