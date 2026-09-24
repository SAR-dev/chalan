// Edge proxy — runs before every matched request.
//
// Responsibilities:
//   1. Role-based instance isolation — when ALLOWED_ROLE is set, only that
//      role's portal is served; other role prefixes redirect to /login.
//   2. Rate-limit the upload endpoint to prevent flood attacks.
//      Uses an in-process sliding-window counter (Map + timestamp).
//      For multi-instance deployments swap this out for a Redis/Upstash store.
//   3. Per-request CSP nonce — a fresh crypto nonce is generated for every
//      page request, injected into the Content-Security-Policy response header
//      AND forwarded to the server via the request headers so Next.js applies
//      it to the inline scripts it renders (see next.config headers).
//
// Why a nonce instead of a static CSP? Next.js inlines its hydration scripts,
// which must be signed by a nonce. A static `Content-Security-Policy` in
// next.config can't carry a per-request nonce, so it lives here (only for
// page routes; API/static responses don't need it).

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

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

  // 1. Role-based access guard
  const guard = roleGuard(pathname, req)
  if (guard) return guard

  // 2. Upload rate limiting
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

  // 3. Per-request CSP nonce (page routes only — enforced by the matcher).
  const nonce = createNonce()
  const csp = buildCsp(nonce)

  // Forward the nonce + CSP to the server so Next applies the nonce to its
  // inline hydration scripts; then set the same CSP for the browser.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("content-security-policy", csp)
  return response
}

export const config = {
  /*
   * Every HTML page route needs the nonce'd CSP. API routes, static assets,
   * _next, and uploads are handled specially:
   *   - /api/uploads      → rate-limited above (needs the proxy to run).
   *   - everything else   → matches the negative-lookahead, so page routes
   *                          (dashboard/merchant/rider/warehouse, login,
   *                          register, track, landing, static files) all get
   *                          the CSP header.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    "/api/uploads",
  ],
}
