import { describe, expect, it } from "vitest"
import { getClientIp, rateLimit } from "@/lib/rate-limit"

describe("rateLimit", () => {
  it("allows first request", () => {
    expect(rateLimit("test-1", 2, 60)).toBeNull()
  })

  it("allows requests within limit", () => {
    expect(rateLimit("test-2", 2, 60)).toBeNull()
    expect(rateLimit("test-2", 2, 60)).toBeNull()
  })

  it("blocks requests exceeding limit with 429", () => {
    // first two: allowed
    rateLimit("test-3", 2, 60)
    rateLimit("test-3", 2, 60)
    // third: blocked
    const res = rateLimit("test-3", 2, 60)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get("Retry-After")).toBeTruthy()
  })

  it("uses separate windows per key", () => {
    rateLimit("key-a", 1, 6000)
    expect(rateLimit("key-a", 1, 6000)).not.toBeNull()
    expect(rateLimit("key-b", 1, 6000)).toBeNull()
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

  it("falls back to unknown when header is missing", () => {
    const req = new Request("http://localhost")
    expect(getClientIp(req)).toBe("unknown")
  })
})
