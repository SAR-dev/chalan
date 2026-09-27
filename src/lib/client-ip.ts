// =============================================================================
// Client IP resolution for rate limiting and the admin IP allowlist
// (ROADMAP P0.6).
//
// The previous implementation trusted `x-real-ip`, `cf-connecting-ip` and the
// left-most `x-forwarded-for` entry unconditionally. Anyone talking to the app
// directly (or through a proxy that does *not* overwrite those headers) can
// send an arbitrary value, which gives every request a fresh rate-limit bucket
// and defeats both the limiter and `ADMIN_IP_ALLOWLIST`.
//
// The fix is the standard "trust the N proxies you actually run" model: the
// operator declares how many reverse-proxy hops sit in front of the app
// (`TRUSTED_PROXY_HOPS`). Only then are the forwarding headers read, and only
// the entry the *last* trusted hop appended — everything to its left is
// client-controlled and ignored.
//
// Pure and edge-safe: no node built-ins, no Redis — `src/proxy.ts` (Edge
// runtime) and `src/lib/rate-limit.ts` (Node) both use it.
// =============================================================================

/** Header names in the order a normal proxy stack writes them. */
const FORWARD_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
] as const

export interface ClientIpEnv {
  /** Number of trusted reverse-proxy hops in front of the app. */
  TRUSTED_PROXY_HOPS?: string | undefined
  [key: string]: string | undefined
}

export interface ClientIpResult {
  ip: string | null
  /** True when headers were read because a trusted proxy is configured. */
  trusted: boolean
  /** Set when forwarded headers arrived but were ignored (untrusted). */
  ignoredHeaders: boolean
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null
  let candidate = value.trim().replace(/^\[|\]$/g, "") // strip [IPv6] brackets
  if (!candidate) return null
  // Some proxies append a port (`1.2.3.4:5678`). Only strip it for IPv4 — a
  // bare IPv6 literal contains several colons and must be left alone.
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"))
  }
  if (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate) ||
    /^[0-9a-f:]+$/i.test(candidate)
  ) {
    return candidate
  }
  return null
}

/** Trusted hop count from the environment; 0 = "no proxy in front of me". */
export function trustedProxyHops(env: ClientIpEnv = process.env): number {
  const raw = Number(env.TRUSTED_PROXY_HOPS ?? 0)
  if (!Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

function headerValue(headers: Headers, name: string): string | null {
  // `Headers` in the Edge runtime and undici both lowercase lookup keys.
  return headers.get(name) ?? headers.get(name.toUpperCase())
}

export function hasForwardingHeaders(headers: Headers): boolean {
  return FORWARD_HEADERS.some((h) => normalizeIp(headerValue(headers, h)))
}

/**
 * Resolve the caller's IP, and only from headers a trusted proxy is
 * configured to write.
 */
export function resolveClientIp(
  headers: Headers,
  env: ClientIpEnv = process.env,
): ClientIpResult {
  const hops = trustedProxyHops(env)
  if (hops === 0) {
    return {
      ip: null,
      trusted: false,
      ignoredHeaders: hasForwardingHeaders(headers),
    }
  }

  // x-forwarded-for is the chain; the other two are single-value headers a
  // single proxy writes. Prefer the chain when present.
  const chain = headerValue(headers, "x-forwarded-for")
  if (chain) {
    const parts = chain
      .split(",")
      .map((p) => normalizeIp(p))
      .filter((p): p is string => p !== null)
    // Each trusted hop appends one entry, so the client address is the
    // `hops`-th from the right. Anything further left was supplied by the
    // client and is discarded.
    const index = parts.length - hops
    const ip = index >= 0 ? parts[index] : null
    if (ip) return { ip, trusted: true, ignoredHeaders: false }
  }

  for (const header of ["x-real-ip", "cf-connecting-ip"]) {
    const ip = normalizeIp(headerValue(headers, header))
    if (ip) return { ip, trusted: true, ignoredHeaders: false }
  }

  return { ip: null, trusted: true, ignoredHeaders: false }
}

/** Convenience wrapper mirroring the old `getClientIp` contract. */
export function clientIpFromHeaders(
  headers: Headers,
  env: ClientIpEnv = process.env,
): string | null {
  return resolveClientIp(headers, env).ip
}
