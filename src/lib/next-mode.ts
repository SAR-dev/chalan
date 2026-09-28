import {
  RIDER_CREDENTIALS,
  SEED_USER_CREDENTIALS,
  type SeedUserCredential,
} from "@/lib/db/seed/seed-content/credentials"

// NEXT_MODE is the seeded-demo switch for local development: with it on, the
// sign-in page offers the well-known dev accounts as a dropdown so you don't
// have to remember `12qwaszx`. It publishes credentials in the browser, so it
// is hard-disabled in production (see validateEnv) and inert unless set.
//
// Server-only by design: the login page reads this in a server component and
// passes the result down as a prop, which keeps NEXT_MODE out of the client
// bundle (unlike NEXT_PUBLIC_* vars, which are inlined at build time).

export interface SeededSignIn {
  label: string
  email: string
  password: string
}

function isTruthyFlag(value: string | undefined): boolean {
  const raw = (value ?? "").trim().toLowerCase()
  return raw === "true" || raw === "1"
}

/** Raw NEXT_MODE parsing, with no environment-scope guard on it. */
export function nextModeFlagSet(): boolean {
  return isTruthyFlag(process.env.NEXT_MODE)
}

/** True when the seeded sign-in helper should be offered. */
export function isNextModeEnabled(): boolean {
  // Belt and braces with validateEnv: never leak seed credentials to a
  // production deployment, even if the env check is bypassed.
  if (process.env.NEXT_PUBLIC_ENV === "production") return false
  return nextModeFlagSet()
}

function toSeededSignIn(label: string, user: SeedUserCredential): SeededSignIn {
  return { label, email: user.email, password: user.password }
}

/**
 * One account per role — enough to sign in as any of them without listing the
 * full seed set. Empty when NEXT_MODE is off, so callers can treat a non-empty
 * result as "render the picker".
 */
export function seededSignIns(): SeededSignIn[] {
  if (!isNextModeEnabled()) return []
  return [
    toSeededSignIn("Super admin", SEED_USER_CREDENTIALS.admin1),
    toSeededSignIn("Warehouse admin", SEED_USER_CREDENTIALS.warehouseAdmin1),
    toSeededSignIn("Merchant", SEED_USER_CREDENTIALS.merchant1),
    toSeededSignIn("Rider", RIDER_CREDENTIALS.rider1),
  ]
}
