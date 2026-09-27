import Redis from "ioredis"
import { NextResponse } from "next/server"
import { resolveClientIp } from "@/lib/client-ip"
import { logger } from "@/lib/logger"

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
let warnedNoRedisInProduction = false

/**
 * Whether the limiter is running in its degraded (per-process) mode.
 * Surfaced by the health endpoint so a multi-instance deploy cannot silently
 * run with per-instance limits (ROADMAP P0.6).
 */
export function rateLimiterDegraded(): boolean {
  if (!process.env.REDIS_URL) {
    return process.env.NODE_ENV === "production"
  }
  return false
}

// Lazy single Redis client. Returns null (falling back to the in-memory Map)
// when REDIS_URL is unset; once a connection succeeds, all limits are stored
// in Redis so they are shared across app instances.
//
// In production a missing REDIS_URL is a misconfiguration that silently turns
// every limit into a per-instance one (trivially bypassed with N instances),
// so it is reported loudly and through /api/health instead of passing
// unnoticed. Requests are still served — a hard failure here would take the
// whole API down for a config problem.
function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) {
    if (process.env.NODE_ENV === "production" && !warnedNoRedisInProduction) {
      warnedNoRedisInProduction = true
      logger.warn(
        "REDIS_URL is not set in production — rate limits are per-instance and can be bypassed. Set REDIS_URL (see docs/DEPLOYMENT.md).",
      )
    }
    return null
  }
  if (redis === undefined) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    redis.on("error", (err) => {
      logger.warn("Redis connection error", { err })
    })
  }
  return redis
}

/**
 * Readiness probe (ROADMAP P2.3): PING the configured Redis. Returns `true`
 * when no Redis is configured (it is optional for single-instance deploys) and
 * `false` when a configured Redis cannot answer within `timeoutMs`.
 */
export async function pingRedis(timeoutMs = 1500): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis ping timeout")), timeoutMs),
      ),
    ])
    return pong === "PONG"
  } catch (err) {
    logger.warn("Redis readiness ping failed", { err })
    return false
  }
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
      logger.warn("Redis request failed, degrading to in-memory", { err })
    }
  }
  return memoryLimit(key, max, window)
}

/**
 * Extracts the client IP from the forwarding headers **a trusted proxy is
 * configured to write** (`TRUSTED_PROXY_HOPS`), or `null` when no IP can be
 * determined.
 *
 * Client-supplied `x-real-ip` / `cf-connecting-ip` / `x-forwarded-for` values
 * are ignored unless the deployment declares its proxy hops — otherwise anyone
 * could mint a fresh bucket per request. See `lib/client-ip.ts`.
 */
export function getClientIp(req: Request): string | null {
  return resolveClientIp(req.headers).ip
}

/** Shared bucket for requests whose IP cannot be resolved. */
const NO_IP_BUCKET = "no-ip"
let warnedNoIp = false

export interface RateLimitByIpOptions {
  /**
   * Fail closed when the client IP cannot be resolved: unidentifiable requests
   * share one bucket instead of skipping the limiter. Use it on the
   * unauthenticated, abuse-prone routes (registration, activation, resend)
   * where "no limit" is the easy path around the control.
   */
  failClosed?: boolean
}

/**
 * Rate limit keyed on the request's client IP.
 *
 * With no resolvable IP: `failClosed` routes fall back to a single shared
 * bucket (and warn once), everything else is not throttled — preferable to
 * lumping every such visitor into one bucket that a single visitor could
 * exhaust (cross-tenant DoS).
 */
export async function rateLimitByIp(
  req: Request,
  prefix: string,
  max: number,
  window: number,
  options: RateLimitByIpOptions = {},
): Promise<NextResponse | null> {
  const resolved = resolveClientIp(req.headers)
  if (resolved.ignoredHeaders) {
    logger.warn("Ignoring client-supplied IP headers", {
      prefix,
      hint: "set TRUSTED_PROXY_HOPS if this deployment has a reverse proxy",
    })
  }
  if (!resolved.ip) {
    if (options.failClosed) {
      if (!warnedNoIp) {
        warnedNoIp = true
        logger.warn(
          "Rate limit cannot resolve a client IP; running fail-closed (all unresolvable requests share one bucket)",
          { prefix },
        )
      }
      return rateLimit(`${prefix}:${NO_IP_BUCKET}`, max, window)
    }
    return null
  }
  return rateLimit(`${prefix}:${resolved.ip}`, max, window)
}
