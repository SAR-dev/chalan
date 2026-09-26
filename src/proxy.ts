// Edge proxy — runs before every matched request.
//
// Responsibilities:
//   1. Role-based instance isolation — when ALLOWED_ROLE is set, only that
//      role's portal is served; other role prefixes redirect to /login.
//   2. Portal-mode gating — when PORTAL_MODE selects a partial deployment
//      (`admin` or `public`), pages of the disabled portals return 404 so
//      their shells (and nav) never render. Both filters apply: a request
//      must satisfy ALLOWED_ROLE (if set) AND PORTAL_MODE.
//   3. Rate-limit the upload endpoint to prevent flood attacks.
//      Uses an in-process sliding-window counter (Map + timestamp).
//      For multi-instance deployments swap this out for a Redis/Upstash store.
//   4. Per-request CSP nonce — a fresh crypto nonce is generated for every
//      page request, injected into the Content-Security-Policy response header
//      AND forwarded to the server via the request headers so Next.js applies
//      it to the inline scripts it renders (see next.config headers).
//   5. Admin IP allowlist — when ADMIN_IP_ALLOWLIST is set, requests to the
//      admin portal (paths starting /dashboard and /api/admin) from IPs
//      outside the list get a 403. Defense-in-depth for the portal; other
//      admin-gated APIs rely on role authz. Unset/empty = disabled.
//
// Why a nonce instead of a static CSP? Next.js inlines its hydration scripts,
// which must be signed by a nonce. A static `Content-Security-Policy` in
// next.config can't carry a per-request nonce, so it lives here (only for
// page routes; API/static responses don't need it).

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { ipAllowed, parseAllowlist } from "@/lib/ip-allowlist"
import { parsePortalMode, portalPageAllowed } from "@/lib/portal-mode"

// ---------------------------------------------------------------------------
// CSP (Content-Security-Policy)
// ---------------------------------------------------------------------------

const SCRIPT_NONCE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"

/**
 * 24 random characters from a 64-char alphabet (~144 bits of entropy).
 * Meets the CSP `nonce-*` token grammar (base64-ish, no padding needed).
 */
function createNonce(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let nonce = ""
  for (const byte of bytes) nonce += SCRIPT_NONCE_CHARS[byte % 64]
  return nonce
}

function buildCsp(nonce: string): string {
  // React's dev build uses eval() (call-stack reconstruction, fast refresh).
  // Production never does, so 'unsafe-eval' is development-only — keeping the
  // production policy strict while unblocking the dev overlay.
  const devScriptSrc =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""

  return [
    "default-src 'self'",
    // Inline hydration scripts get the per-request nonce; no 'unsafe-inline'.
    `script-src 'self' 'nonce-${nonce}'${devScriptSrc}`,
    // next-themes / NextTopLoader inject inline <style> for theme flicker
    // prevention & progress bar — those need 'unsafe-inline' (styles only).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

// ---------------------------------------------------------------------------
// Role-based instance isolation
// ---------------------------------------------------------------------------

const ROLE_PREFIXES: Record<string, string> = {
  dashboard: "/dashboard",
  merchant: "/merchant",
  rider: "/rider",
  warehouse: "/warehouse",
}

const ALLOWED_ROLE = process.env.ALLOWED_ROLE?.trim().toLowerCase()

function roleGuard(pathname: string, req: NextRequest): NextResponse | null {
  // No restriction configured — serve everything.
  if (!ALLOWED_ROLE) return null

  // Validate the env var at runtime so misconfigured deploys fail loudly.
  if (!ROLE_PREFIXES[ALLOWED_ROLE]) {
    console.error(
      `[proxy] Invalid ALLOWED_ROLE="${ALLOWED_ROLE}". ` +
        `Must be one of: ${Object.keys(ROLE_PREFIXES).join(", ")}`,
    )
    return null
  }

  for (const [role, prefix] of Object.entries(ROLE_PREFIXES)) {
    // This role is the allowed one — let it through.
    if (role === ALLOWED_ROLE) continue

    // Another role's prefix — redirect to login.
    if (pathname.startsWith(prefix)) {
      const loginUrl = new URL("/login", req.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Portal-mode gating (ROADMAP 5.4) — PORTAL_MODE selects which portals this
// instance serves. Pages of a disabled portal 404 at the edge, so its shell
// (and nav) never renders. `all` (default) serves everything: the guard is a
// no-op. API/session-side enforcement lives in requireSession().
// ---------------------------------------------------------------------------

const PORTAL_MODE = parsePortalMode(process.env.PORTAL_MODE)

function portalModeGuard(pathname: string): Response | null {
  if (portalPageAllowed(pathname, PORTAL_MODE)) return null
  return new Response("Not found", { status: 404 })
}

// ---------------------------------------------------------------------------
// Admin IP allowlist — defense-in-depth for the admin portal. Scope: paths
// starting /dashboard and /api/admin; other admin-gated APIs rely on role
// authz instead. Disabled (null) when ADMIN_IP_ALLOWLIST is unset or empty.
// ---------------------------------------------------------------------------

const ADMIN_IP_ALLOWLIST = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST)

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/api/admin")
}

function proxyClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  if (first) return first
  const real = req.headers.get("x-real-ip")?.trim()
  if (real) return real
  return null
}

// ---------------------------------------------------------------------------
// Simple in-process sliding-window rate limiter.
// Sufficient for single-instance / single-region deployments.
// Replace with @upstash/ratelimit for multi-instance setups.
// ---------------------------------------------------------------------------

interface Window {
  count: number
  resetAt: number
}

const uploadWindows = new Map<string, Window>()

const UPLOAD_LIMIT = 20 // requests
const UPLOAD_WINDOW_MS = 60_000 // per minute

function pruneExpired(now: number): void {
  for (const [ip, entry] of uploadWindows) {
    if (now >= entry.resetAt) uploadWindows.delete(ip)
  }
}

function uploadRateLimit(ip: string): boolean {
  const now = Date.now()
  pruneExpired(now)
  const entry = uploadWindows.get(ip)

  if (!entry || now >= entry.resetAt) {
    uploadWindows.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS })
    return true // allowed
  }

  if (entry.count >= UPLOAD_LIMIT) return false // blocked

  entry.count++
  return true // allowed
}

// ---------------------------------------------------------------------------

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1. Admin IP allowlist — reject non-listed IPs before anything else.
  //    /api/admin only enters the matcher for this check, so pass allowed
  //    requests through without the page-route CSP nonce.
  if (isAdminPath(pathname)) {
    if (ADMIN_IP_ALLOWLIST) {
      const ip = proxyClientIp(req)
      if (!ip || !ipAllowed(ip, ADMIN_IP_ALLOWLIST)) {
        console.warn(
          `[proxy] Admin IP allowlist denied ${ip ?? "unknown"} for ${pathname}`,
        )
        return new Response("Forbidden", { status: 403 })
      }
    }
    if (pathname.startsWith("/api/admin")) return NextResponse.next()
  }

  // 2. Role-based access guard
  const guard = roleGuard(pathname, req)
  if (guard) return guard

  // 3. Portal-mode guard — pages of a disabled portal 404.
  const portal = portalModeGuard(pathname)
  if (portal) return portal

  // 4. Upload rate limiting
  if (req.method === "POST" && pathname === "/api/uploads") {
    const forwarded = req.headers.get("x-forwarded-for")
    const ip = forwarded?.split(",")[0]?.trim()
    // No resolvable IP → skip the limiter rather than share one "unknown"
    // bucket across every visitor (cross-tenant DoS).
    if (ip && !uploadRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many uploads. Please wait a moment and try again." },
        { status: 429 },
      )
    }
  }

  // 5. Per-request CSP nonce (page routes only — enforced by the matcher).
  const nonce = createNonce()
  const csp = buildCsp(nonce)

  // Forward the nonce + CSP to the server so Next applies the nonce to its
  // inline hydration scripts; then set the same CSP for the browser. The
  // current path goes along so unauthenticated redirects can build /login?next=.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)
  requestHeaders.set("x-pathname", pathname + req.nextUrl.search)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("content-security-policy", csp)
  return response
}

export const config = {
  /*
   * Every HTML page route needs the nonce'd CSP. API routes, static assets,
   * _next, and uploads are handled specially:
   *   - /api/uploads      → rate-limited above (needs the proxy to run).
   *   - /api/admin        → IP-allowlisted above, then passed through
   *                          without a CSP nonce (API response).
   *   - everything else   → matches the negative-lookahead, so page routes
   *                          (dashboard/merchant/rider/warehouse, login,
   *                          register, track, landing, static files) all get
   *                          the CSP header.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    "/api/uploads",
    "/api/admin(.*)",
  ],
}
