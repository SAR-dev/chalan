import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getClientIp,
  rateLimit,
  rateLimitByIp,
  rateLimiterDegraded,
} from "@/lib/rate-limit"

afterEach(() => {
  vi.unstubAllEnvs()
})

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

// Forwarding headers are only trusted when the deployment
// declares its proxy hops, so these cases pass the env explicitly.
describe("getClientIp", () => {
  it("returns IP from x-forwarded-for when a proxy is trusted", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1")
    try {
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "203.0.113.1" },
      })
      expect(getClientIp(req)).toBe("203.0.113.1")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("takes the right-most entry of a comma-separated list", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1")
    try {
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1, 192.168.1.1" },
      })
      expect(getClientIp(req)).toBe("192.168.1.1")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("ignores a spoofed x-forwarded-for when no proxy is trusted", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0")
    try {
      const req = new Request("http://localhost", {
        headers: {
          "x-real-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.1, 10.0.0.1",
        },
      })
      expect(getClientIp(req)).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("prefers the right-most forwarded entry over x-real-ip when trusted", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1")
    try {
      // nginx appends the address it saw last: with one trusted hop the last
      // XFF entry is the real client, whatever the client prepended itself.
      const req = new Request("http://localhost", {
        headers: {
          "x-real-ip": "10.0.0.1",
          "x-forwarded-for": "1.1.1.1, 198.51.100.7",
        },
      })
      expect(getClientIp(req)).toBe("198.51.100.7")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("falls back to x-real-ip / cf-connecting-ip when trusted", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1")
    try {
      expect(
        getClientIp(
          new Request("http://localhost", {
            headers: { "x-real-ip": "198.51.100.7" },
          }),
        ),
      ).toBe("198.51.100.7")
      expect(
        getClientIp(
          new Request("http://localhost", {
            headers: { "cf-connecting-ip": "198.51.100.9" },
          }),
        ),
      ).toBe("198.51.100.9")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("returns null when no proxy header is present", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1")
    try {
      expect(getClientIp(new Request("http://localhost"))).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("rateLimitByIp", () => {
  it("does not throttle when no IP resolves", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0")
    try {
      const req = new Request("http://localhost")
      for (let i = 0; i < 5; i++) {
        expect(await rateLimitByIp(req, "no-ip-open", 1, 60)).toBeNull()
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("fails closed on the shared bucket when asked to", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0")
    try {
      const req = new Request("http://localhost")
      expect(
        await rateLimitByIp(req, "no-ip-closed", 2, 60, { failClosed: true }),
      ).toBeNull()
      expect(
        await rateLimitByIp(req, "no-ip-closed", 2, 60, { failClosed: true }),
      ).toBeNull()
      const blocked = await rateLimitByIp(req, "no-ip-closed", 2, 60, {
        failClosed: true,
      })
      expect(blocked?.status).toBe(429)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("keys on the trusted IP so spoofing cannot mint new buckets", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1")
    try {
      const spoof = (left: string) =>
        new Request("http://localhost", {
          headers: { "x-forwarded-for": `${left}, 198.51.100.42` },
        })
      expect(await rateLimitByIp(spoof("1.1.1.1"), "spoof", 1, 60)).toBeNull()
      // Same real client, different forged prefix → same bucket → blocked.
      expect(
        (await rateLimitByIp(spoof("2.2.2.2"), "spoof", 1, 60))?.status,
      ).toBe(429)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("rateLimiterDegraded", () => {
  it("is degraded in production without REDIS_URL", () => {
    vi.stubEnv("REDIS_URL", "")
    vi.stubEnv("NODE_ENV", "production")
    try {
      expect(rateLimiterDegraded()).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("is healthy with Redis or outside production", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    try {
      expect(rateLimiterDegraded()).toBe(false)
    } finally {
      vi.unstubAllEnvs()
      vi.stubEnv("NODE_ENV", "test")
      expect(rateLimiterDegraded()).toBe(false)
      vi.unstubAllEnvs()
    }
  })
})
