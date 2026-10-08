const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

/**
 * Extra origins the operator has explicitly trusted via
 * `BETTER_AUTH_ALLOWED_URLS` (comma-separated). These are *configured*, never
 * derived from the request, so widening the allowlist with them does not
 * reintroduce the Host-header attack the `SITE_URL` comment below rules out.
 * This is what makes a second reachable origin (a LAN IP, a preview host)
 * usable: `NEXT_PUBLIC_SITE_URL` is singular and also drives cookie/redirect
 * behaviour, so it cannot express "trusted for CSRF too".
 */
const EXTRA_ORIGINS = (process.env.BETTER_AUTH_ALLOWED_URLS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean)
  .flatMap((u) => {
    try {
      return [new URL(u).origin]
    } catch {
      return []
    }
  })

/**
 * CSRF origin check for API requests.
 *
 * Browsers attach an `Origin` header to every cross-origin request that may
 * carry credentials and to most same-origin POST/PATCH/DELETE calls. Requests
 * without an `Origin` or `Referer` (curl, server-to-server calls, test
 * clients) are allowed through — they cannot be driven by a victim's browser.
 *
 * This is a defense-in-depth layer on top of better-auth's `sameSite: "lax"`
 * session cookies. It matters most for the public, cookie-free mutation
 * routes (registration, receiver note) where nothing else rejects a
 * cross-site call.
 */
export function isAllowedOrigin(req: Request): boolean {
  const originValue = req.headers.get("origin") ?? req.headers.get("referer")
  if (!originValue) return true

  try {
    const origin = new URL(originValue).origin
    const allowed = new Set<string>()

    if (SITE_URL) {
      // A configured site origin is authoritative: do NOT also trust origins
      // derived from the request, or a caller able to influence the Host header
      // could make an arbitrary Origin match. Explicitly configured extras
      // (EXTRA_ORIGINS) are still allowed — the operator asked for them by name.
      allowed.add(new URL(SITE_URL).origin)
      for (const extra of EXTRA_ORIGINS) allowed.add(extra)
      return allowed.has(origin)
    }

    // No configured origin (local dev, tests): fall back to the request's own
    // origin, which is the best signal available.
    allowed.add(new URL(req.url).origin)
    const host = req.headers.get("host")
    if (host) {
      allowed.add(`${new URL(req.url).protocol}//${host}`)
    }

    return allowed.has(origin)
  } catch {
    return false
  }
}
