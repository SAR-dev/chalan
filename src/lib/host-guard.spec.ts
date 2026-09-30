import { describe, expect, it } from "vitest"
import { isPrivateHost } from "./host-guard"

describe("isPrivateHost", () => {
  it("blocks loopback, RFC1918 and link-local IPv4", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.0.0.5",
      "192.168.1.10",
      "172.16.0.1",
      "172.31.255.254",
      "169.254.169.254",
    ]) {
      expect(isPrivateHost(host), host).toBe(true)
    }
  })

  it("blocks internal IPv6 and internal-looking names", () => {
    for (const host of [
      "::1",
      "[::1]",
      "fd00::1",
      "fe80::1",
      "db.internal",
      "printer.local",
      "api.localhost",
    ]) {
      expect(isPrivateHost(host), host).toBe(true)
    }
  })

  it("treats a blank host as unsafe", () => {
    expect(isPrivateHost("")).toBe(true)
    expect(isPrivateHost("   ")).toBe(true)
  })

  it("allows public mail hosts", () => {
    for (const host of [
      "smtp.gmail.com",
      "email-smtp.ap-southeast-1.amazonaws.com",
      "8.8.8.8",
      "172.32.0.1",
      "172.15.0.1",
    ]) {
      expect(isPrivateHost(host), host).toBe(false)
    }
  })

  it("is case- and whitespace-insensitive", () => {
    expect(isPrivateHost("  SMTP.GMAIL.COM  ")).toBe(false)
    expect(isPrivateHost("  LOCALHOST ")).toBe(true)
  })
})
