const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

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
      allowed.add(new URL(SITE_URL).origin)
    }
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
