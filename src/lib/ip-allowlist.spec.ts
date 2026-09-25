import { describe, expect, it } from "vitest"
import { ipAllowed, parseAllowlist } from "@/lib/ip-allowlist"

describe("parseAllowlist", () => {
  it("returns null when unset (disabled)", () => {
    expect(parseAllowlist(undefined)).toBeNull()
  })

  it("returns null for empty or blank input", () => {
    expect(parseAllowlist("")).toBeNull()
    expect(parseAllowlist("   ")).toBeNull()
    expect(parseAllowlist(" , , ")).toBeNull()
  })

  it("trims whitespace around entries", () => {
    const list = parseAllowlist("  127.0.0.1 , 10.0.0.0/8  ")
    expect(ipAllowed("127.0.0.1", list)).toBe(true)
    expect(ipAllowed("10.1.2.3", list)).toBe(true)
  })

  it("ignores invalid entries but keeps valid ones", () => {
    const list = parseAllowlist("not-an-ip, 1.2.3.4, 999.0.0.1, 10.0.0.0/33")
    expect(ipAllowed("1.2.3.4", list)).toBe(true)
    expect(ipAllowed("5.6.7.8", list)).toBe(false)
  })

  it("yields a deny-all list when every entry is invalid", () => {
    const list = parseAllowlist("garbage, 10.0.0.0/33, 1.2.3.4/8/8")
    expect(list).toEqual([])
    expect(ipAllowed("10.0.0.1", list)).toBe(false)
  })

  it("tolerates empty segments between commas", () => {
    const list = parseAllowlist("1.2.3.4,,5.6.7.8")
    expect(ipAllowed("1.2.3.4", list)).toBe(true)
    expect(ipAllowed("5.6.7.8", list)).toBe(true)
    expect(ipAllowed("9.9.9.9", list)).toBe(false)
  })
})

describe("ipAllowed", () => {
  it("allows everything when the list is disabled", () => {
    expect(ipAllowed("8.8.8.8", null)).toBe(true)
    expect(ipAllowed("2001:db8::1", parseAllowlist(undefined))).toBe(true)
    expect(ipAllowed("not-an-ip", null)).toBe(true)
  })

  it("matches exact IPv4 addresses", () => {
    const list = parseAllowlist("203.0.113.5")
    expect(ipAllowed("203.0.113.5", list)).toBe(true)
    expect(ipAllowed("203.0.113.6", list)).toBe(false)
    expect(ipAllowed("203.0.113.50", list)).toBe(false)
  })

  it("matches loopback 127.0.0.1", () => {
    const list = parseAllowlist("127.0.0.1")
    expect(ipAllowed("127.0.0.1", list)).toBe(true)
    expect(ipAllowed("127.0.0.2", list)).toBe(false)
  })

  it("matches a /24 including the .0 and .255 boundaries", () => {
    const list = parseAllowlist("192.168.1.0/24")
    expect(ipAllowed("192.168.1.0", list)).toBe(true)
    expect(ipAllowed("192.168.1.255", list)).toBe(true)
    expect(ipAllowed("192.168.0.255", list)).toBe(false)
    expect(ipAllowed("192.168.2.0", list)).toBe(false)
  })

  it("matches large CIDR blocks", () => {
    const list = parseAllowlist("10.0.0.0/8")
    expect(ipAllowed("10.0.0.1", list)).toBe(true)
    expect(ipAllowed("10.255.255.255", list)).toBe(true)
    expect(ipAllowed("11.0.0.0", list)).toBe(false)
  })

  it("matches prefixes that end mid-byte", () => {
    const list = parseAllowlist("192.168.1.0/23")
    expect(ipAllowed("192.168.0.100", list)).toBe(true)
    expect(ipAllowed("192.168.1.255", list)).toBe(true)
    expect(ipAllowed("192.168.2.1", list)).toBe(false)
  })

  it("matches exact IPv6 addresses in any spelling", () => {
    const list = parseAllowlist("2001:db8::1")
    expect(ipAllowed("2001:db8::1", list)).toBe(true)
    expect(ipAllowed("2001:0db8:0000:0000:0000:0000:0000:0001", list)).toBe(
      true,
    )
    expect(ipAllowed("2001:DB8::1", list)).toBe(true)
    expect(ipAllowed("2001:db8::2", list)).toBe(false)
    expect(ipAllowed("::1", list)).toBe(false)
  })

  it("matches IPv6 CIDR ranges", () => {
    const list = parseAllowlist("2001:db8::/32")
    expect(ipAllowed("2001:db8::1", list)).toBe(true)
    expect(ipAllowed("2001:db8:ffff::1", list)).toBe(true)
    expect(ipAllowed("2001:db9::1", list)).toBe(false)
  })

  it("keeps IPv4 and IPv6 entries independent", () => {
    const list = parseAllowlist("127.0.0.1, ::1")
    expect(ipAllowed("127.0.0.1", list)).toBe(true)
    expect(ipAllowed("::1", list)).toBe(true)
    expect(ipAllowed("::2", list)).toBe(false)
    expect(ipAllowed("::ffff:127.0.0.1", list)).toBe(false)
  })

  it("allows any address when * is present", () => {
    const list = parseAllowlist("1.2.3.4, *")
    expect(ipAllowed("8.8.8.8", list)).toBe(true)
    expect(ipAllowed("2001:db8::1", list)).toBe(true)
    expect(ipAllowed("not-an-ip", list)).toBe(true)
  })

  it("rejects unparseable request IPs while a list is active", () => {
    const list = parseAllowlist("10.0.0.0/8")
    expect(ipAllowed("unknown", list)).toBe(false)
    expect(ipAllowed("", list)).toBe(false)
    expect(ipAllowed("10.0.0.1 ", list)).toBe(true)
  })

  it("ignores IPv4 entries with leading zeros", () => {
    expect(parseAllowlist("010.0.0.1")).toEqual([])
  })
})
