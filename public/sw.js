/* Chalan service worker — PWA installability + offline app shell.
 *
 * Strategy:
 *  - Precache the public shell (landing + manifest) on install.
 *  - Navigations: network-first, falling back to the cached public shell so
 *    the app still boots offline.
 *  - Static assets (/_next/static, /icon, /apple-icon, fonts): stale-while-
 *    revalidate — content-hashed URLs are immutable, so the cache copy is
 *    always correct until a redeploy bumps the hash.
 *  - API routes (/api/*) and uploads are deliberately NOT intercepted —
 *    responses are session- and role-scoped, so caching them would leak data
 *    across users.
 *
 * WHAT MUST NEVER BE CACHED (ROADMAP R0.4)
 * -----------------------------------------
 * Authenticated HTML. Two paths used to put it on disk:
 *
 *  1. every navigation's response was written under the key `"/"`, so visiting
 *     /dashboard while signed in stored the portal there — surviving logout and
 *     served to whoever next opened this device offline; and
 *  2. `cache.addAll(["/"])` at install followed `/`, which ALWAYS redirects
 *     (src/app/page.tsx: authenticated → their portal, otherwise → /landing),
 *     so the worker installed by a signed-in user precached their dashboard.
 *
 * The precache now targets `/landing` directly, and navigation writes go
 * through `isStorableShell()`. Both matter: fixing only the fetch handler
 * leaves the install-time leak in place.
 *
 * Bump VERSION to invalidate old caches on deploy. Deploying a new SW with a
 * changed CACHE_VERSION prunes the previous generation automatically — which
 * is how any HTML already written by v24 gets dropped.
 */

const VERSION = "v27"
const SHELL_CACHE = `chalan-shell-${VERSION}`
const STATIC_CACHE = `chalan-static-${VERSION}`

/**
 * Offline fallback, and the page precached on install.
 *
 * `/` itself can never be cached: it is a pure redirector, so whatever it
 * resolves to belongs to whoever triggered the request.
 */
const OFFLINE_FALLBACK = "/landing"

const SHELL_URLS = [OFFLINE_FALLBACK, "/manifest.webmanifest"]

/**
 * Exact-match allowlist of public pages whose HTML is safe to keep on a shared
 * device.
 *
 * Deliberately NOT a prefix list: `/track/<id>` renders one order's contents
 * and `/help/<slug>` is a specific article, so neither belongs in the shell.
 * `/` is excluded because it redirects (see the header note).
 */
const SHELL_PATHS = new Set([
  "/landing",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/activate",
  "/activated",
  "/apply/rider",
  "/track",
  "/help",
  "/terms",
  "/privacy",
  "/rates",
])

/**
 * Whether a navigation response may be written to the shell cache.
 * Every clause is a way the naive version leaked.
 */
function isStorableShell(pathname, response) {
  // Not a public page (or a redirector whose key would not match its content).
  if (!SHELL_PATHS.has(pathname)) return false
  // A redirected response is some other URL's document.
  if (!response.ok || response.redirected) return false
  // Respect the origin's own instruction — a response that says "do not store"
  // must not be stored, whatever the path.
  const cacheControl = response.headers.get("Cache-Control") || ""
  if (/\bno-store\b|\bprivate\b/.test(cacheControl)) return false
  return true
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                // Prune every cache that is not the active generation. Keeping
                // the check prefix-agnostic means a brand rename (which swaps
                // the `chalan-` prefix) can't strand caches from an older name.
                key !== SHELL_CACHE &&
                key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests; skip API and uploads entirely.
  if (request.method !== "GET" || url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return
  if (url.pathname.startsWith("/uploads/")) return

  // Navigations — network-first, cached public pages as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isStorableShell(url.pathname, response)) {
            const copy = response.clone()
            caches
              .open(SHELL_CACHE)
              // Keyed by the path actually requested, so a cached page can
              // only ever satisfy a request for that same page.
              .then((cache) => cache.put(url.pathname, copy))
          }
          return response
        })
        .catch(() =>
          caches.match(url.pathname).then((cached) => {
            if (cached) return cached
            // Anything not explicitly cached — every authenticated page —
            // lands on the public shell rather than a stale portal.
            return caches.match(OFFLINE_FALLBACK)
          }),
        ),
    )
    return
  }

  // Static assets — stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
