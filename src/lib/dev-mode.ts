import {
  RIDER_CREDENTIALS,
  SEED_USER_CREDENTIALS,
  type SeedUserCredential,
} from "@/lib/db/seed/seed-content/credentials"

// Demo mode is the seeded-demo switch, keyed on NEXT_PUBLIC_ENV: a deployment
// that declares itself `development` also gets the sign-in page offering the
// well-known dev accounts as a dropdown (so you don't have to remember
// `12qwaszx`), a demo banner, and a database reset to the basic seed every day
// at midnight.
//
// It publishes credentials in the browser, which is why it hangs off the
// deployment's own environment declaration rather than a flag of its own — the
// same var that gates Vercel Analytics and localhost trustedOrigins. A
// production deployment says `production` and therefore never renders it.

export interface SeededSignIn {
  label: string
  email: string
  password: string
}

/** True when the seeded-demo helper (sign-in picker, banner, daily reset)
 *  should be active. */
export function isDevModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENV === "development"
}

function toSeededSignIn(label: string, user: SeedUserCredential): SeededSignIn {
  return { label, email: user.email, password: user.password }
}

/**
 * One account per role — enough to sign in as any of them without listing the
 * full seed set. Empty unless this is a development deployment, so callers can
 * treat a non-empty result as "render the picker".
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
