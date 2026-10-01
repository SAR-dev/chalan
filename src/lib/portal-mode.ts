// Portal modes — the three deployment shapes this codebase ships as
// (ROADMAP 5.4). The server-only `PORTAL_MODE` env var selects which portals
// an instance serves at runtime (no rebuild):
//
//   admin  → Super Admin dashboard + warehouse portal   (internal ops)
//   public → merchant portal + rider portal             (customer-facing)
//   all    → everything (default — dev / e2e / single instance)
//
// Everything here is pure except `isRoleAllowed`, which reads `process.env`
// when `mode` is omitted — call that form only on the server. Tests and any
// client-adjacent code use the explicit forms (`parsePortalMode` with an
// injected value, `isRoleAllowedIn`, `allowedRolesFor`, `portalPageAllowed`).
// The browser never learns the mode directly: it gets `portalAllowed` from
// `/api/users/me`.
//
// Defense-in-depth: `src/lib/env.ts` validates PORTAL_MODE strictly at boot;
// the parser below is deliberately lenient (unset/invalid → "all") so a typo
// can never lock a deployment out of its own portal.

export type PortalMode = "admin" | "public" | "all"

export const PORTAL_MODES: PortalMode[] = ["admin", "public", "all"]

// Role groups per mode. `public` is a deployment name, not a role name — it
// maps to the two roles on the customer-facing side of the product.
const ADMIN_ROLES = ["SUPER_ADMIN", "WAREHOUSE_ADMIN"]
const PUBLIC_ROLES = ["MERCHANT", "RIDER"]
const ALL_ROLES = ["SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"]

export function parsePortalMode(raw: string | undefined): PortalMode {
  const value = raw?.trim().toLowerCase()
  if (value === "admin" || value === "public") return value
  return "all"
}

export function allowedRolesFor(mode: PortalMode): string[] {
  if (mode === "admin") return [...ADMIN_ROLES]
  if (mode === "public") return [...PUBLIC_ROLES]
  return [...ALL_ROLES]
}

export function isRoleAllowedIn(role: string, mode: PortalMode): boolean {
  return allowedRolesFor(mode).includes(role)
}

/** Server-only when `mode` is omitted — reads `process.env.PORTAL_MODE`. */
export function isRoleAllowed(role: string, mode?: PortalMode): boolean {
  const resolved = mode ?? parsePortalMode(process.env.PORTAL_MODE)
  return isRoleAllowedIn(role, resolved)
}

// Page prefixes of the portals each mode does NOT serve. Shared surface
// (/login, /register, /track, /help, /apply, landing, public APIs) is
// intentionally absent — it stays reachable in every mode.
const DISABLED_PORTAL_PREFIXES: Record<Exclude<PortalMode, "all">, string[]> = {
  admin: ["/merchant", "/rider"],
  public: ["/dashboard", "/warehouse"],
}

/**
 * Pure proxy helper: is this page path part of a portal this mode serves?
 * Segment-aware — "/merchant" and "/merchant/orders" block in `admin` mode,
 * but "/merchants" (not a portal subtree) does not. `all` serves everything.
 */
export function portalPageAllowed(pathname: string, mode: PortalMode): boolean {
  if (mode === "all") return true
  return !DISABLED_PORTAL_PREFIXES[mode].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
