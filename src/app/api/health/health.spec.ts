import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/health", () => {
  it("returns 200 with ok: true", async () => {
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true })
  })

  it("flags a degraded rate limiter in production without Redis", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("REDIS_URL", "")
    const json = await (await GET()).json()
    expect(json).toMatchObject({ ok: true, rateLimiter: { degraded: true } })
  })

  it("reports a healthy limiter outside production", async () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("REDIS_URL", "")
    const json = await (await GET()).json()
    expect(json).toMatchObject({ rateLimiter: { degraded: false } })
  })
})
