import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const state = vi.hoisted(() => ({
  dbOk: true,
  redisOk: true,
  degraded: false,
}))

vi.mock("@/lib/db", () => ({
  dbRead: {
    execute: () =>
      state.dbOk
        ? Promise.resolve({ rows: [{ ok: 1 }] })
        : Promise.reject(new Error("db down")),
  },
}))

vi.mock("@/lib/rate-limit", () => ({
  pingRedis: () => Promise.resolve(state.redisOk),
  rateLimiterDegraded: () => state.degraded,
}))

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.dbOk = true
  state.redisOk = true
  state.degraded = false
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  errSpy.mockRestore()
})

describe("GET /api/ready", () => {
  it("200 when the DB and Redis probes pass", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      checks: { db: true, redis: true },
    })
  })

  it("503 when the DB probe fails", async () => {
    state.dbOk = false
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      ok: false,
      checks: { db: false },
    })
    // The failure is logged with the error (ROADMAP P2.2).
    const record = JSON.parse(errSpy.mock.calls.at(-1)?.[0] as string)
    expect(record).toMatchObject({
      level: "error",
      msg: "Readiness DB probe failed",
    })
  })

  it("503 when a configured Redis is unreachable", async () => {
    state.redisOk = false
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      ok: false,
      checks: { db: true, redis: false },
    })
  })

  it("reports a degraded rate limiter without failing readiness", async () => {
    state.degraded = true
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      rateLimiter: { degraded: true },
    })
  })
})
