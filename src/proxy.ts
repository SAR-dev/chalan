// Edge proxy — runs before every matched request.
//
// Responsibilities:
//   1. Role-based instance isolation — when ALLOWED_ROLE is set, only that
//      role's portal is served; other role prefixes redirect to /login.
//   2. Rate-limit the upload endpoint to prevent flood attacks.
//      Uses an in-process sliding-window counter (Map + timestamp).
//      For multi-instance deployments swap this out for a Redis/Upstash store.

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

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
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

    if (!uploadRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many uploads. Please wait a moment and try again." },
        { status: 429 },
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  /*
   * Match every role portal path plus the upload API route.
   * API routes, login, register, track, landing, and static assets are
   * intentionally excluded — they must remain accessible on all instances so
   * auth, public tracking, and uploads continue to work.
   */
  matcher: [
    "/dashboard/:path*",
    "/merchant/:path*",
    "/rider/:path*",
    "/warehouse/:path*",
    "/api/uploads",
  ],
}
