/* Jhor Express service worker — PWA installability + offline app shell.
 *
 * Strategy:
 *  - Precache the app shell (start page + manifest) on install.
 *  - Navigations: network-first, falling back to the cached shell so the app
 *    still boots offline.
 *  - Static assets (/_next/static, /icon, /apple-icon, fonts): stale-while-
 *    revalidate — content-hashed URLs are immutable, so the cache copy is
 *    always correct until a redeploy bumps the hash.
 *  - API routes (/api/*) and uploads are deliberately NOT intercepted —
 *    responses are session- and role-scoped, so caching them would leak data
 *    across users.
 *
 * Bump VERSION to invalidate old caches on deploy. Deploying a new SW with a
 * changed CACHE_VERSION prunes the previous generation automatically.
 */

const VERSION = "v23"
const SHELL_CACHE = `jhorexpress-shell-${VERSION}`
const STATIC_CACHE = `jhorexpress-static-${VERSION}`

const SHELL_URLS = ["/", "/manifest.webmanifest"]

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
                key.startsWith("jhorexpress-") &&
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

  // Navigations — network-first with cached shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy))
          return response
        })
        .catch(() => caches.match("/")),
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
