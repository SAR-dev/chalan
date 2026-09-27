import { describe, expect, it } from "vitest"
import {
  clientIpFromHeaders,
  resolveClientIp,
  trustedProxyHops,
} from "@/lib/client-ip"

function headers(values: Record<string, string>): Headers {
  return new Headers(values)
}

describe("trustedProxyHops", () => {
  it("defaults to 0 and ignores nonsense", () => {
    expect(trustedProxyHops({})).toBe(0)
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "" })).toBe(0)
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-2" })).toBe(0)
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "abc" })).toBe(0)
  })

  it("reads a valid hop count", () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "1" })).toBe(1)
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" })).toBe(2)
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2.9" })).toBe(2)
  })
})

describe("resolveClientIp", () => {
  it("ignores client-supplied forwarding headers when no proxy is trusted", () => {
    const spoofed = headers({
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "5.6.7.8",
      "cf-connecting-ip": "9.9.9.9",
    })
    const result = resolveClientIp(spoofed, {})
    expect(result.ip).toBeNull()
    expect(result.trusted).toBe(false)
    expect(result.ignoredHeaders).toBe(true)
  })

  it("returns null for a request with no forwarding headers", () => {
    const result = resolveClientIp(headers({}), { TRUSTED_PROXY_HOPS: "1" })
    expect(result.ip).toBeNull()
    expect(result.trusted).toBe(true)
  })

  it("takes the right-most entry for a single trusted hop", () => {
    const h = headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" })
    expect(resolveClientIp(h, { TRUSTED_PROXY_HOPS: "1" }).ip).toBe(
      "203.0.113.7",
    )
  })

  it("drops everything the client prepended", () => {
    // Attacker sends "1.1.1.1" in front; the proxy appends the real address.
    const h = headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.22" })
    expect(resolveClientIp(h, { TRUSTED_PROXY_HOPS: "1" }).ip).toBe(
      "198.51.100.22",
    )
  })

  it("walks two hops back for a two-proxy stack", () => {
    const h = headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.22, 10.0.0.4" })
    expect(resolveClientIp(h, { TRUSTED_PROXY_HOPS: "2" }).ip).toBe(
      "198.51.100.22",
    )
  })

  it("returns null when the chain is shorter than the hop count", () => {
    const h = headers({ "x-forwarded-for": "1.1.1.1" })
    expect(resolveClientIp(h, { TRUSTED_PROXY_HOPS: "2" }).ip).toBeNull()
  })

  it("falls back to x-real-ip and cf-connecting-ip when trusted", () => {
    expect(
      resolveClientIp(headers({ "x-real-ip": "203.0.113.9" }), {
        TRUSTED_PROXY_HOPS: "1",
      }).ip,
    ).toBe("203.0.113.9")
    expect(
      resolveClientIp(headers({ "cf-connecting-ip": "203.0.113.10" }), {
        TRUSTED_PROXY_HOPS: "1",
      }).ip,
    ).toBe("203.0.113.10")
  })

  it("normalizes ports, IPv6 brackets and whitespace", () => {
    expect(
      resolveClientIp(headers({ "x-real-ip": " 203.0.113.5:41234 " }), {
        TRUSTED_PROXY_HOPS: "1",
      }).ip,
    ).toBe("203.0.113.5")
    expect(
      resolveClientIp(headers({ "x-real-ip": "[2001:db8::1]" }), {
        TRUSTED_PROXY_HOPS: "1",
      }).ip,
    ).toBe("2001:db8::1")
  })

  it("rejects values that are not IPs", () => {
    expect(
      clientIpFromHeaders(headers({ "x-real-ip": "not-an-ip" }), {
        TRUSTED_PROXY_HOPS: "1",
      }),
    ).toBeNull()
  })
})
