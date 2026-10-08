import { afterEach, describe, expect, it, vi } from "vitest"

const SITE = "https://app.example.com"

async function loadIsAllowedOrigin(siteUrl?: string, allowedUrls?: string) {
  vi.resetModules()
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl
  if (allowedUrls === undefined) delete process.env.BETTER_AUTH_ALLOWED_URLS
  else process.env.BETTER_AUTH_ALLOWED_URLS = allowedUrls
  return (await import("./csrf")).isAllowedOrigin
}

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers })
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.BETTER_AUTH_ALLOWED_URLS
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

  // A second reachable origin (a LAN IP, a preview host) has to work, and
  // `NEXT_PUBLIC_SITE_URL` is singular — so the operator names the extras in
  // BETTER_AUTH_ALLOWED_URLS and CSRF has to honour them too.
  it("also trusts origins named in BETTER_AUTH_ALLOWED_URLS", async () => {
    const isAllowed = await loadIsAllowedOrigin(
      SITE,
      "http://192.168.1.10:3000,http://192.168.1.10:3000/path",
    )
    expect(
      isAllowed(
        req("http://192.168.1.10:3000/api/x", {
          origin: "http://192.168.1.10:3000",
        }),
      ),
    ).toBe(true)
    // A path in the entry must not widen it past the origin.
    expect(
      isAllowed(
        req("http://192.168.1.10:3000/api/x", {
          origin: "http://192.168.1.10:3000/path",
        }),
      ),
    ).toBe(true)
  })

  it("still rejects an origin that is only in neither list", async () => {
    const isAllowed = await loadIsAllowedOrigin(
      SITE,
      "http://192.168.1.10:3000",
    )
    expect(
      isAllowed(
        req("http://192.168.1.10:3000/api/x", {
          origin: "http://evil.example",
        }),
      ),
    ).toBe(false)
  })

  it("ignores unparseable entries instead of throwing", async () => {
    const isAllowed = await loadIsAllowedOrigin(
      SITE,
      "not-a-url, ,http://ok.test",
    )
    expect(
      isAllowed(
        req("https://app.example.com/api/x", { origin: "http://ok.test" }),
      ),
    ).toBe(true)
    expect(
      isAllowed(
        req("https://app.example.com/api/x", { origin: "http://no.test" }),
      ),
    ).toBe(false)
  })
})
