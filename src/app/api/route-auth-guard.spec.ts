/**
 * Static auth guard for every API route.
 *
 * Walks every `route.ts` under src/app/api and fails when a handler file has no
 * server-side auth entry point and is not explicitly allowlisted as public by
 * design. New routes must either call one of the auth helpers below or be
 * added to PUBLIC_ALLOWLIST with a real justification.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const API_DIR = fileURLToPath(new URL(".", import.meta.url))

// Auth entry points recognised in a route file:
// - requireSession()            — the standard session + profile lookup
// - auth.api.getSession          — users/me reads the Better Auth session direct
// - isAuthorizedCron             — cron routes authenticate via CRON_SECRET
// - applyOrderTransition/…       — order transition routes delegate auth to
//                                  @/features/orders/transitions, which calls
//                                  requireSession() + per-transition authorize
const AUTH_ENTRY_POINTS: RegExp[] = [
  /requireSession\(/,
  /auth\.api\.getSession/,
  /isAuthorizedCron\(/,
  /authenticateApiKey\(/,
  /applyOrderTransition\(/,
  /applyBulkOrderTransition\(/,
]

// Routes that are public by design. Every entry must stay honest: none of
// them may call requireSession() (asserted below) and none may go stale.
const PUBLIC_ALLOWLIST = new Set<string>([
  // Better Auth catch-all — the library performs its own session/CSRF checks.
  "auth/[...all]/route.ts",
  // Email verification link target: single-use token, no session possible.
  "auth/verify-email/route.ts",
  // Liveness probe for the Docker HEALTHCHECK — intentionally unauthenticated.
  "health/route.ts",
  // Readiness probe (DB/Redis) for load balancers / Docker healthchecks.
  "ready/route.ts",
  // Staff account activation link target: single-use 24h token in the body,
  // no session possible (merchant moderators + warehouse admins).
  "activate/route.ts",
  // Issues a short-lived signed token for the anonymous rider-application NID
  // Upload — rate-limited, no session exists at that point.
  "uploads/token/route.ts",
  // Unverified merchants resend their activation email from the login page.
  "merchants/resend-verification/route.ts",
  // Public tracking page lets a recipient note their own parcel (rate-limited).
  "orders/[id]/receiver-note/route.ts",
  // Public list of active warehouses for the rider application form.
  "warehouses/public/route.ts",
  // Public active delivery cities, zones, and the N×N zone-pricing matrix used
  // by the Delivery Fee Calculator on the public landing page. No session
  // exists for anonymous visitors making a fee estimate.
  "delivery-cities/route.ts",
  "delivery-zones/route.ts",
  "zone-pricing/route.ts",
  // The published parcel-label template (R5), read by every quick-print
  // surface for warehouse admins and riders. The block layout carries no
  // personal data — per-parcel values come from the order at print time — and
  // the admin designer's draft/published management lives under the
  // authenticated `admin/label-template` routes instead.
  "label-template/route.ts",
  // Machine-readable OpenAPI spec — no personal data, derived from the
  // already-public Zod schemas.
  "v1/openapi/route.ts",
])

function collectRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry.name === "route.ts") out.push(full)
  }
  return out
}

function toPosix(path: string): string {
  return path.split(sep).join("/")
}

function relativeRoute(path: string): string {
  return toPosix(relative(API_DIR, path))
}

function hasAuthEntryPoint(source: string): boolean {
  return AUTH_ENTRY_POINTS.some((pattern) => pattern.test(source))
}

const routeFiles = collectRouteFiles(API_DIR).sort()
const routeSources = new Map(
  routeFiles.map((file) => [relativeRoute(file), readFileSync(file, "utf8")]),
)

describe("API route auth guard", () => {
  it("scans the whole api folder", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(100)
  })

  it("every route file enforces auth server-side or is allowlisted public", () => {
    const offenders: string[] = []
    for (const [path, source] of routeSources) {
      if (PUBLIC_ALLOWLIST.has(path)) continue
      if (!hasAuthEntryPoint(source)) offenders.push(path)
    }
    if (offenders.length > 0) {
      throw new Error(
        "API routes without a server-side auth entry point " +
          "(requireSession / auth.api.getSession / isAuthorizedCron / " +
          "order transition helpers):\n" +
          offenders.map((file) => `  - src/app/api/${file}`).join("\n") +
          "\nAdd the appropriate auth check to the handler. If the route is " +
          "genuinely public, add it to PUBLIC_ALLOWLIST with a justification.",
      )
    }
    expect(offenders).toEqual([])
  })

  it("allowlist entries exist (no stale paths)", () => {
    const stale = [...PUBLIC_ALLOWLIST].filter(
      (path) => !routeSources.has(path),
    )
    expect(stale, `Stale allowlist entries: ${stale.join(", ")}`).toEqual([])
  })

  it("allowlist stays minimal (no allowlisted route calls requireSession)", () => {
    const dishonest = [...PUBLIC_ALLOWLIST].filter((path) => {
      const source = routeSources.get(path)
      return source !== undefined && /requireSession\(/.test(source)
    })
    expect(
      dishonest,
      `Allowlisted routes that already call requireSession — drop them from ` +
        `PUBLIC_ALLOWLIST: ${dishonest.join(", ")}`,
    ).toEqual([])
  })
})
