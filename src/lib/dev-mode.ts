import {
  RIDER_CREDENTIALS,
  SEED_USER_CREDENTIALS,
  type SeedUserCredential,
} from "@/lib/db/seed/seed-content/credentials"

// NEXT_DEVELOPMENT_MODE is the seeded-demo switch for local development: with
// it on, the sign-in page offers the well-known dev accounts as a dropdown so
// you don't have to remember `12qwaszx`, a demo banner renders, and the
// database is reset to the basic seed every day at midnight. It publishes
// credentials in the browser, so it is hard-disabled in production (see
// validateEnv) and inert unless set.
//
// Server-only by design: the login page reads this in a server component and
// passes the result down as a prop, which keeps NEXT_DEVELOPMENT_MODE out of
// the client bundle (unlike NEXT_PUBLIC_* vars, which are inlined at build
// time).

export interface SeededSignIn {
  label: string
  email: string
  password: string
}

function isTruthyFlag(value: string | undefined): boolean {
  const raw = (value ?? "").trim().toLowerCase()
  return raw === "true" || raw === "1"
}

/** Raw NEXT_DEVELOPMENT_MODE parsing, with no environment-scope guard on it. */
export function devModeFlagSet(): boolean {
  return isTruthyFlag(process.env.NEXT_DEVELOPMENT_MODE)
}

/** True when the seeded-demo helper (sign-in picker, banner, daily reset)
 *  should be active. */
export function isDevModeEnabled(): boolean {
  // Belt and braces with validateEnv: never leak seed credentials to a
  // production deployment, even if the env check is bypassed.
  if (process.env.NEXT_PUBLIC_ENV === "production") return false
  // NODE_ENV is set by the runtime itself, so it also catches a deployment
  // that shipped without NEXT_PUBLIC_ENV (the mistake that turns on the
  // credential picker and the nightly database reset).
  if (process.env.NODE_ENV === "production") return false
  return devModeFlagSet()
}

function toSeededSignIn(label: string, user: SeedUserCredential): SeededSignIn {
  return { label, email: user.email, password: user.password }
}

/**
 * One account per role — enough to sign in as any of them without listing the
 * full seed set. Empty when NEXT_DEVELOPMENT_MODE is off, so callers can treat
 * a non-empty result as "render the picker".
 */
export function seededDevSignIns(): SeededSignIn[] {
  if (!isDevModeEnabled()) return []
  return [
    toSeededSignIn("Super admin", SEED_USER_CREDENTIALS.admin1),
    toSeededSignIn("Warehouse admin", SEED_USER_CREDENTIALS.warehouseAdmin1),
    toSeededSignIn("Merchant", SEED_USER_CREDENTIALS.merchant1),
    toSeededSignIn("Rider", RIDER_CREDENTIALS.rider1),
  ]
}
