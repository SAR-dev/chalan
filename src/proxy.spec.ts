import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// `src/proxy.ts` reads ALLOWED_ROLE / PORTAL_MODE / ADMIN_IP_ALLOWLIST at module
// scope, so each case re-imports it with the env it needs.

const BASE = "http://localhost:3000"

const MANAGED_ENV = [
  "ALLOWED_ROLE",
  "PORTAL_MODE",
  "ADMIN_IP_ALLOWLIST",
  "TRUSTED_PROXY_HOPS",
] as const

async function loadProxy(env: Partial<Record<string, string>> = {}) {
  vi.resetModules()
  for (const key of MANAGED_ENV) delete process.env[key]
  for (const [key, value] of Object.entries(env)) process.env[key] = value
  return import("./proxy")
}

function req(
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: init.headers,
  })
}

afterEach(() => {
  for (const key of MANAGED_ENV) delete process.env[key]
  vi.restoreAllMocks()
})

describe("role isolation (ALLOWED_ROLE)", () => {
  it("redirects another portal to /login", async () => {
    const { proxy } = await loadProxy({ ALLOWED_ROLE: "merchant" })
    const res = proxy(req("/dashboard/orders"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${BASE}/login`)
  })

  it("serves the allowed portal", async () => {
    const { proxy } = await loadProxy({ ALLOWED_ROLE: "merchant" })
    const res = proxy(req("/merchant/orders"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-security-policy")).toContain("nonce-")
  })

  it("ignores an unknown ALLOWED_ROLE and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { proxy } = await loadProxy({ ALLOWED_ROLE: "bogus" })
    const res = proxy(req("/dashboard"))
    expect(res.status).toBe(200)
    expect(error).toHaveBeenCalled()
  })

  it("restricts nothing when unset", async () => {
    const { proxy } = await loadProxy()
    for (const path of ["/dashboard", "/merchant", "/rider", "/warehouse"]) {
      expect(proxy(req(path)).status, path).toBe(200)
    }
  })
})

describe("portal-mode gating", () => {
  it("404s a disabled portal's pages", async () => {
    const { proxy } = await loadProxy({ PORTAL_MODE: "admin" })
    expect(proxy(req("/merchant/orders")).status).toBe(404)
    expect(proxy(req("/rider")).status).toBe(404)
  })

  it("serves the enabled portal", async () => {
    const { proxy } = await loadProxy({ PORTAL_MODE: "admin" })
    expect(proxy(req("/dashboard")).status).toBe(200)
  })

  it("serves everything by default", async () => {
    const { proxy } = await loadProxy()
    expect(proxy(req("/merchant")).status).toBe(200)
    expect(proxy(req("/dashboard")).status).toBe(200)
  })
})

describe("admin IP allowlist", () => {
  const withIp = (ip: string) => ({
    "x-forwarded-for": ip,
  })

  it("403s an unlisted IP on an admin page", async () => {
    const { proxy } = await loadProxy({
      ADMIN_IP_ALLOWLIST: "10.0.0.1",
      TRUSTED_PROXY_HOPS: "1",
    })
    const res = proxy(req("/dashboard", { headers: withIp("203.0.113.9") }))
    expect(res.status).toBe(403)
  })

  it("allows a listed IP", async () => {
    const { proxy } = await loadProxy({
      ADMIN_IP_ALLOWLIST: "10.0.0.0/8",
      TRUSTED_PROXY_HOPS: "1",
    })
    const res = proxy(req("/dashboard", { headers: withIp("10.1.2.3") }))
    expect(res.status).toBe(200)
  })

  it("403s an unlisted IP on an admin-exclusive API prefix", async () => {
    const { proxy } = await loadProxy({
      ADMIN_IP_ALLOWLIST: "10.0.0.1",
      TRUSTED_PROXY_HOPS: "1",
    })
    for (const path of [
      "/api/team",
      "/api/audit-logs",
      "/api/email-logs",
      "/api/platform-config",
      "/api/admin/users",
    ]) {
      expect(
        proxy(req(path, { headers: withIp("203.0.113.9") })).status,
        path,
      ).toBe(403)
    }
  })

  it("does NOT apply to API prefixes shared with other roles", async () => {
    // A merchant or rider outside the allowlist must still reach these.
    const { proxy } = await loadProxy({
      ADMIN_IP_ALLOWLIST: "10.0.0.1",
      TRUSTED_PROXY_HOPS: "1",
    })
    for (const path of [
      "/api/payouts",
      "/api/packages",
      "/api/announcements",
      "/api/rider-applications",
    ]) {
      expect(
        proxy(req(path, { headers: withIp("203.0.113.9") })).status,
        path,
      ).not.toBe(403)
    }
  })

  it("passes admin APIs through without a page CSP", async () => {
    const { proxy } = await loadProxy({
      ADMIN_IP_ALLOWLIST: "10.0.0.1",
      TRUSTED_PROXY_HOPS: "1",
    })
    const res = proxy(req("/api/admin/users", { headers: withIp("10.0.0.1") }))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-security-policy")).toBeNull()
  })

  it("is disabled when unset", async () => {
    const { proxy } = await loadProxy()
    expect(proxy(req("/dashboard")).status).toBe(200)
  })
})

describe("CSP nonce and request correlation", () => {
  it("sets a nonce'd CSP and forwards the nonce + path", async () => {
    const { proxy } = await loadProxy()
    const res = proxy(req("/dashboard/orders?page=2"))
    const csp = res.headers.get("content-security-policy")
    expect(csp).toContain("script-src 'self' 'nonce-")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("'unsafe-inline' 'nonce") // nonce only, no fallback
    expect(res.status).toBe(200)
  })

  // qr-scanner (R9) builds its decode worker from a blob: URL — without an
  // explicit worker-src, worker creation falls back to script-src, which is
  // nonce-only and would block it.
  it("grants qr-scanner's blob worker and nothing else", async () => {
    const { proxy } = await loadProxy()
    const csp = proxy(req("/dashboard")).headers.get("content-security-policy")
    expect(csp).toContain("worker-src 'self' blob:")
    // Workers only: no WASM eval anywhere, and no blob: in script-src itself.
    expect(csp).not.toContain("wasm-unsafe-eval")
    const scriptSrc = csp?.split("; ").find((d) => d.startsWith("script-src "))
    expect(scriptSrc).not.toContain("blob:")
  })

  it("mints a request id when none is supplied", async () => {
    const { proxy } = await loadProxy()
    const res = proxy(req("/dashboard"))
    expect(res.headers.get("x-request-id")).toMatch(/[0-9a-f-]{8,}/)
  })

  it("reuses a valid inbound request id", async () => {
    const { proxy } = await loadProxy()
    const id = "11111111-2222-3333-4444-555555555555"
    const res = proxy(req("/dashboard", { headers: { "x-request-id": id } }))
    expect(res.headers.get("x-request-id")).toBe(id)
  })
})
