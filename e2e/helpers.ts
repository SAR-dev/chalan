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
  // Rider 1 is seeded PICKUP-only (`RIDER_TASK_TYPES` cycles PICKUP, DELIVERY,
  // BOTH), so it is never given a delivery parcel and its delivery queue — and
  // therefore its run sheet — is legitimately empty. Rider 2 is the first
  // DELIVERY-capable seed rider and does get parcels.
  deliveryRider: {
    email: "rider2@email.com",
    password: "12qwaszx",
    home: "/rider",
  },
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

/** Any authenticated landing page, by role shell. */
const AUTHENTICATED_URL = /\/(merchant|dashboard|warehouse|rider)/

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
  // Already on /login (e.g. ?next=... or ?success=...): reload so the fills
  // below hit a freshly hydrated form. The reload keeps the query string, so
  // the return path survives sign-in.
  if (page.url().includes("/login")) {
    await page.reload()
  } else {
    await page.goto("/login")
  }

  // Signing out of an app page (clearCookies) can leave requests in flight that
  // 401 and trigger the app's automatic-logout client redirect — which would
  // remount the form mid-fill. Let that settle first (bounded).
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {})

  const emailInput = page.locator(auth.loginEmail)
  const passwordInput = page.locator(auth.loginPassword)

  // Fill + verify in a loop: if a late remount wipes the values, re-fill.
  for (let attempt = 0; attempt < 3; attempt++) {
    await emailInput.fill(cred.email)
    // Wait for the form to become submittable instead of sleeping a fixed
    // amount — the password field is enabled once the email passes validation.
    await passwordInput.waitFor({ state: "visible" })
    await passwordInput.fill(cred.password)
    const [emailValue, passwordValue] = await Promise.all([
      emailInput.inputValue(),
      passwordInput.inputValue(),
    ])
    if (emailValue === cred.email && passwordValue === cred.password) break
  }

  await passwordInput.press("Enter")

  await page.waitForURL(options.waitFor ?? AUTHENTICATED_URL, {
    timeout: options.timeout ?? 15_000,
  })
  await waitForAppReady(page)
}

/**
 * Wait for a page to settle after navigation.
 *
 * `networkidle` can hang when a background request (SWR polling, streaming)
 * never goes quiet, so the wait is bounded and best-effort — the web-first
 * assertions that follow are the real gate. This replaces bare
 * `waitForLoadState("networkidle")` calls that could stall for the full default
 * Timeout under CI load.
 */
export async function waitForAppReady(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  await page.waitForLoadState("load").catch(() => {})
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {})
}

/**
 * A sonner toast, matched by its text.
 *
 * Toasts are portaled and carry no stable per-message testid, so this is the
 * documented fallback: match text, but scope it to the toast container rather
 * than the whole page.
 */
export function toast(page: Page, text: string | RegExp) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text })
}
