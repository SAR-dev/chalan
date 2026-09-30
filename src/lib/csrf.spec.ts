import { afterEach, describe, expect, it, vi } from "vitest"

const SITE = "https://app.example.com"

async function loadIsAllowedOrigin(siteUrl?: string) {
  vi.resetModules()
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl
  return (await import("./csrf")).isAllowedOrigin
}

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers })
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL
})

describe("isAllowedOrigin", () => {
  it("allows requests with no Origin/Referer (curl, server-to-server)", async () => {
    const isAllowed = await loadIsAllowedOrigin()
    expect(isAllowed(req("http://localhost:3000/api/x"))).toBe(true)
  })

  it("allows a same-origin request when a site URL is configured", async () => {
    const isAllowed = await loadIsAllowedOrigin(SITE)
    expect(
      isAllowed(
        req("https://app.example.com/api/x", {
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(true)
  })

  it("rejects a cross-origin request when a site URL is configured", async () => {
    const isAllowed = await loadIsAllowedOrigin(SITE)
    expect(
      isAllowed(
        req("https://app.example.com/api/x", {
          origin: "https://evil.example",
        }),
      ),
    ).toBe(false)
  })

  it("does not let a spoofed Host make an arbitrary Origin pass", async () => {
    // With a configured site URL the request-derived origins are NOT trusted,
    // so an attacker who controls Host cannot widen the allow set.
    const isAllowed = await loadIsAllowedOrigin(SITE)
    expect(
      isAllowed(
        req("https://app.example.com/api/x", {
          origin: "https://evil.example",
          host: "evil.example",
        }),
      ),
    ).toBe(false)
  })

  it("falls back to the request origin when no site URL is configured", async () => {
    const isAllowed = await loadIsAllowedOrigin(undefined)
    expect(
      isAllowed(
        req("http://localhost:3000/api/x", { origin: "http://localhost:3000" }),
      ),
    ).toBe(true)
    expect(
      isAllowed(
        req("http://localhost:3000/api/x", { origin: "http://other.test" }),
      ),
    ).toBe(false)
  })

  it("accepts the configured site URL as an origin even on a different host", async () => {
    const isAllowed = await loadIsAllowedOrigin(SITE)
    expect(
      isAllowed(
        req("http://internal:3000/api/x", {
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(true)
  })

  it("uses Referer when Origin is absent", async () => {
    const isAllowed = await loadIsAllowedOrigin(SITE)
    expect(
      isAllowed(
        req("https://app.example.com/api/x", {
          referer: "https://app.example.com/merchant/orders",
        }),
      ),
    ).toBe(true)
    expect(
      isAllowed(
        req("https://app.example.com/api/x", {
          referer: "https://evil.example/merchant/orders",
        }),
      ),
    ).toBe(false)
  })

  it("rejects a malformed Origin", async () => {
    const isAllowed = await loadIsAllowedOrigin(SITE)
    expect(
      isAllowed(req("https://app.example.com/api/x", { origin: "not-a-url" })),
    ).toBe(false)
  })
})
