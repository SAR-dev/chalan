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
  // Readiness also reports pool saturation (ROADMAP R3.1).
  pool: { waitingCount: 0, totalCount: 3, options: { max: 20 } },
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

  // Pool saturation was invisible before (ROADMAP R3.1): once every connection
  // is checked out, requests queue behind it and nothing in the app said so —
  // so a pool bottleneck was indistinguishable from a slow database.
  it("reports pool saturation without affecting readiness", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).pool).toEqual({ waiting: 0, total: 3, max: 20 })
  })

  it("503 when the DB probe fails", async () => {
    state.dbOk = false
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      ok: false,
      checks: { db: false },
    })
    // The failure is logged with the error (ROADMAP P2.2). Look the record up
    // rather than taking the last line: the per-request access log writes its
    // own line after this one (ROADMAP R3.1), and a 503 is itself a 5xx.
    const records: Record<string, unknown>[] = errSpy.mock.calls.map(
      (call: unknown[]) =>
        JSON.parse(String(call[0])) as Record<string, unknown>,
    )
    const record = records.find((r) => r.msg === "Readiness DB probe failed")
    expect(record, "probe failure was not logged").toBeTruthy()
    expect(record).toMatchObject({ level: "error" })
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
