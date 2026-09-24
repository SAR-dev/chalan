import { describe, expect, it } from "vitest"
import { getClientIp, rateLimit } from "@/lib/rate-limit"

describe("rateLimit", () => {
  it("allows first request", async () => {
    expect(await rateLimit("test-1", 2, 60)).toBeNull()
  })

  it("allows requests within limit", async () => {
    expect(await rateLimit("test-2", 2, 60)).toBeNull()
    expect(await rateLimit("test-2", 2, 60)).toBeNull()
  })

  it("blocks requests exceeding limit with 429", async () => {
    // first two: allowed
    await rateLimit("test-3", 2, 60)
    await rateLimit("test-3", 2, 60)
    // third: blocked
    const res = await rateLimit("test-3", 2, 60)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get("Retry-After")).toBeTruthy()
  })

  it("uses separate windows per key", async () => {
    await rateLimit("key-a", 1, 6000)
    expect(await rateLimit("key-a", 1, 6000)).not.toBeNull()
    expect(await rateLimit("key-b", 1, 6000)).toBeNull()
  })
})

describe("getClientIp", () => {
  it("returns IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    })
    expect(getClientIp(req)).toBe("203.0.113.1")
  })

  it("takes first IP from comma-separated list", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1, 192.168.1.1" },
    })
    expect(getClientIp(req)).toBe("203.0.113.1")
  })

  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-real-ip": "198.51.100.7",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      },
    })
    expect(getClientIp(req)).toBe("198.51.100.7")
  })

  it("prefers cf-connecting-ip when x-real-ip is missing", () => {
    const req = new Request("http://localhost", {
      headers: { "cf-connecting-ip": "198.51.100.9" },
    })
    expect(getClientIp(req)).toBe("198.51.100.9")
  })

  it("returns null when no proxy header is present", () => {
    const req = new Request("http://localhost")
    expect(getClientIp(req)).toBeNull()
  })
})
