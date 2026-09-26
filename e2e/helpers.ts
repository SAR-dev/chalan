import type { Page } from "@playwright/test"
import { auth } from "./selectors"

/**
 * Seeded credentials used by the e2e suite. Mirrors
 * `src/lib/db/seed/seed-content.ts` (SEED_USER_CREDENTIALS / SEED_DEMO_CREDENTIALS).
 */
export const CREDS = {
  superAdmin: {
    email: "admin1@email.com",
    password: "12qwaszx",
    home: "/dashboard",
  },
  warehouseAdmin: {
    email: "warehouse.admin1@email.com",
    password: "12qwaszx",
    home: "/warehouse",
  },
  merchant: {
    email: "merchant1@email.com",
    password: "12qwaszx",
    home: "/merchant",
  },
  rider: { email: "rider1@email.com", password: "12qwaszx", home: "/rider" },
  demoMerchant: {
    email: "demo@kikuya.com",
    password: "12qwaszx",
    home: "/merchant",
  },
} as const

export type E2ECredential = {
  email: string
  password: string
  home?: string
}

/** Any authenticated landing page (onboarding-incomplete merchants hit /welcome). */
const AUTHENTICATED_URL = /\/(merchant|dashboard|warehouse|rider|welcome)/

/**
 * Sign in through the login form and wait until the app has settled.
 *
 * Cookies are cleared first: starting a login while a prior session is active
 * makes the login page redirect an already-authed user away before the form can
 * be submitted (e.g. S1 logs in as merchant, then as admin).
 */
export async function login(
  page: Page,
  cred: E2ECredential,
  options: { waitFor?: RegExp; timeout?: number } = {},
): Promise<void> {
  await page.context().clearCookies()
  await page.goto("/login")

  const emailInput = page.locator(auth.loginEmail)
  const passwordInput = page.locator(auth.loginPassword)

  await emailInput.fill(cred.email)
  // Wait for the form to become submittable instead of sleeping a fixed amount —
  // the password field is enabled once the email passes client-side validation.
  await passwordInput.waitFor({ state: "visible" })
  await passwordInput.fill(cred.password)
  await passwordInput.press("Enter")

  await page.waitForURL(options.waitFor ?? AUTHENTICATED_URL, {
    timeout: options.timeout ?? 15_000,
  })
  await page.waitForLoadState("networkidle")
}
