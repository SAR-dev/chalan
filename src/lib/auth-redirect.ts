// Unauthenticated-redirect helpers: every automatic logout should carry the
// current page as ?next= so the login screen can send the user back after a
// successful sign-in. Pure/client-safe — the server-side header reader lives
// in lib/login-redirect.ts (keeps next/headers out of client bundles).

/**
 * Validates a `next` value: must be a same-site absolute path, never the
 * login page itself, never protocol-relative (`//host`) or backslash tricks.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  const path = raw.trim()
  if (!path.startsWith("/")) return null
  if (path.startsWith("//") || path.startsWith("/\\")) return null
  if (path.toLowerCase().startsWith("/login")) return null
  if (path.startsWith("/api")) return null
  return path
}

/** Login URL carrying `path` (the current page) as ?next=. */
export function loginPathWithNext(path: string | null | undefined): string {
  const next = safeNextPath(path)
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login"
}
