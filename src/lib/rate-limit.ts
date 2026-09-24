import Redis from "ioredis"
import { NextResponse } from "next/server"

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Fallback store when Redis is not configured or unreachable. Keeps single-
// instance deployments (and local dev/tests) working without extra infra, and
// lets the app degrade gracefully instead of failing closed during a Redis
// outage. Limits are only shared across instances when REDIS_URL is set.
const store = new Map<string, RateLimitEntry>()

let lastSweepAt = 0
const SWEEP_INTERVAL_MS = 1_000

// Sweep the store at most once per second. Every request already re-checks its
// own `resetAt` when its key is touched, so the global sweep is only a safety
// net for keys that are never touched again — keeping it cheap is fine.
function sweepIfDue(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}

function memoryLimit(key: string, max: number, window: number) {
  const windowMs = window * 1000
  const now = Date.now()

  sweepIfDue(now)

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

// Fixed-window counter in Redis. Atomic via a single Lua script:
//   - INCR the key, and on the first request of a window PEXPIRE it so the
//     key self-clears when the window lapses.
//   - Returns [count, ttlMs] so the caller can build an accurate Retry-After.
const WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`

let redis: Redis | null | undefined

// Lazy single Redis client. Returns null (falling back to the in-memory Map)
// when REDIS_URL is unset; once a connection succeeds, all limits are stored
// in Redis so they are shared across app instances.
function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (redis === undefined) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    redis.on("error", (err) => {
      console.warn("[rate-limit] Redis connection error:", err.message)
    })
  }
  return redis
}

/**
 * Fixed-window rate limiter for API route handlers.
 *
 * Returns `null` when the request is allowed, or a `NextResponse` with
 * 429 status + `Retry-After` header when the limit is exceeded.
 *
 * Uses Redis (`REDIS_URL`) when configured so limits are shared across
 * instances; otherwise falls back to an in-memory Map (single-instance
 * deployments and local dev). If Redis is configured but unreachable, we
 * degrade to the in-memory store rather than failing requests.
 *
 * @param key    Unique identifier (e.g. IP + route).
 * @param max    Max requests per window.
 * @param window Window size in seconds.
 */
export async function rateLimit(
  key: string,
  max: number,
  window: number,
): Promise<NextResponse | null> {
  const client = getRedis()
  if (client) {
    try {
      const [count, ttl] = (await client.eval(
        WINDOW_SCRIPT,
        1,
        `rl:${key}`,
        String(max),
        String(window),
      )) as [number, number]
      if (Number(count) > max) {
        const retryAfter = Math.max(1, Math.ceil(Number(ttl) / 1000))
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        )
      }
      return null
    } catch (err) {
      console.warn(
        "[rate-limit] Redis request failed, degrading to in-memory:",
        err instanceof Error ? err.message : err,
      )
    }
  }
  return memoryLimit(key, max, window)
}

/**
 * Extracts the client IP from trusted proxy headers, or `null` when none can
 * be determined.
 *
 * Precedence: `x-real-ip` (set by nginx/Caddy), `cf-connecting-ip`
 * (Cloudflare), then the left-most entry of `x-forwarded-for`. The proxy
 * layers of production deployments overwrite these headers, so a direct
 * client cannot spoof them.
 *
 * Returns `null` instead of a shared `"unknown"` value so every unidentifiable
 * request is handled individually — never throttled together in one bucket
 * that a single visitor could exhaust (cross-tenant DoS).
 */
export function getClientIp(req: Request): string | null {
  for (const header of ["x-real-ip", "cf-connecting-ip"]) {
    const value = req.headers.get(header)?.trim()
    if (value) return value
  }
  const forwarded = req.headers.get("x-forwarded-for")?.trim()
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return null
}

/**
 * Rate limit keyed on the request's client IP. Requests without a resolvable
 * IP (missing/invalid proxy headers) are not throttled — preferable to
 * lumping every such visitor into one shared "unknown" bucket.
 */
export async function rateLimitByIp(
  req: Request,
  prefix: string,
  max: number,
  window: number,
): Promise<NextResponse | null> {
  const ip = getClientIp(req)
  if (!ip) return null
  return rateLimit(`${prefix}:${ip}`, max, window)
}
