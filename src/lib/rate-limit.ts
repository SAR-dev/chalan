import { NextResponse } from "next/server"

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

function pruneExpired(windowMs: number) {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt + windowMs) store.delete(key)
  }
}

/**
 * Sliding-window rate limiter for API route handlers.
 *
 * Returns `null` when the request is allowed, or a `NextResponse` with
 * 429 status + `Retry-After` header when the limit is exceeded.
 *
 * Uses an in-memory Map — suitable for single-instance deployments.
 * For serverless/multi-instance, use an external store (Redis, etc.).
 *
 * @param key    Unique identifier (e.g. IP + route).
 * @param max    Max requests per window.
 * @param window Window size in seconds.
 */
export function rateLimit(
  key: string,
  max: number,
  window: number,
): NextResponse | null {
  const windowMs = window * 1000
  const now = Date.now()

  pruneExpired(windowMs)

  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  entry.count++
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    )
  }

  return null
}

/**
 * Extracts the client IP from the request, falling back to "unknown".
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return "unknown"
}
