import "dotenv/config"

import { createHmac } from "node:crypto"
import { expect, type Page, test } from "@playwright/test"
import { Client } from "pg"
import { login } from "../helpers"
import { email } from "../selectors"

const PASSWORD = "testpass123"
const SITE_ORIGIN = "http://localhost:3000"

/** Skip onboarding for a freshly registered merchant. The shell redirects
 *  incomplete merchants to /welcome asynchronously, so navigate to /merchant
 *  and wait for that decision instead of checking the URL immediately. */
async function skipOnboardingIfNeeded(page: Page) {
  await page.goto("/merchant")
  await page.waitForLoadState("networkidle").catch(() => {})
  const skip = page.getByRole("button", { name: /skip for now/i })
  try {
    await skip.waitFor({ state: "visible", timeout: 5_000 })
  } catch {
    return // already onboarded
  }
  await skip.click()
  await page.waitForURL(/\/merchant/, { timeout: 15_000 })
  await page.waitForLoadState("networkidle")
}

/**
 * Read the merchant registration token straight from Postgres — the same
 * DATABASE_URL the server uses (.env, loaded via dotenv like scripts/setup.ts).
 */
async function merchantVerificationToken(
  emailAddress: string,
): Promise<string | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const res = await client.query(
      `SELECT "emailVerificationToken" FROM merchant WHERE email = $1`,
      [emailAddress],
    )
    return (res.rows[0]?.emailVerificationToken as string | null) ?? null
  } finally {
    await client.end()
  }
}

/**
 * Better Auth 1.7.5 signs email-verification tokens as stateless HS256 JWTs
 * (`createEmailVerificationToken` → `signJWT` in dist/crypto/jwt.mjs) and
 * writes NOTHING to the `verification` table — so there is no row to read.
 * Re-derive the token here exactly the way better-auth would have signed it.
 */
function signVerifyToken(
  payload: Record<string, string>,
  expiresInSeconds: number,
): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not set — .env failed to load")
  }
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  const header = encode({ alg: "HS256", typ: "JWT" })
  const body = encode({ ...payload, iat: now, exp: now + expiresInSeconds })
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url")
  return `${header}.${body}.${signature}`
}

function expectRedirect(res: { status(): number }) {
  expect(res.status()).toBeGreaterThanOrEqual(300)
  expect(res.status()).toBeLessThan(400)
}

// ─── S39. Change email ──────────────────────────────────────────────────────
test.describe("S39. Change email", () => {
  test("merchant changes their own login email via the verification link", async ({
    page,
  }) => {
    const stamp = Date.now()
    const oldEmail = `e2e-emailchg-${stamp}@test.com`
    const newEmail = `e2e-emailchg-new+${stamp}@test.com`

    // Throwaway merchant — mutating a seeded account would break every other
    // suite (they all sign in as the seeded users).
    const registered = await page.request.post("/api/merchants", {
      data: {
        businessName: `E2E Email ${stamp}`,
        ownerName: "E2E Owner",
        email: oldEmail,
        phone: "+8801710000003",
        address: "E2E Test Address, Dhaka",
        businessType: "E-commerce",
        password: PASSWORD,
      },
    })
    expect(registered.ok()).toBeTruthy()

    // Activate the fresh account with the token from the merchant row.
    const registrationToken = await merchantVerificationToken(oldEmail)
    expect(registrationToken).toBeTruthy()
    const activated = await page.request.get(
      `/api/auth/verify-email?token=${registrationToken}`,
      { maxRedirects: 0 },
    )
    expectRedirect(activated)
    expect(activated.headers().location).toContain("success=email-verified")

    // Sign in (unverified merchants are bounced back to /login).
    await login(page, { email: oldEmail, password: PASSWORD })
    await skipOnboardingIfNeeded(page)

    await page.goto("/merchant/account")
    await expect(page.locator(email.current)).toHaveValue(oldEmail)

    // No-op guard: the current address can't be submitted.
    await page.locator(email.input).fill(oldEmail)
    await expect(page.locator(email.submit)).toBeDisabled()

    // Request the change — verification is sent to the NEW address.
    await page.locator(email.input).fill(newEmail)
    await page.locator(email.submit).click()
    await expect(
      page.getByText(`Verification sent to ${newEmail}`),
    ).toBeVisible()
    await expect(page.locator(email.input)).toHaveValue("")

    // Confirm with the token better-auth emailed (re-signed above — the e2e
    // environment has no SMTP, so the mailbox itself is unreadable).
    const confirmToken = signVerifyToken(
      {
        email: oldEmail,
        updateTo: newEmail,
        requestType: "change-email-verification",
      },
      3600,
    )
    const confirmed = await page.request.get(
      `/api/auth/verify-email?token=${confirmToken}&callbackURL=${encodeURIComponent(
        "/merchant/account",
      )}`,
      { maxRedirects: 0 },
    )
    expectRedirect(confirmed)
    expect(confirmed.headers().location).toContain("/merchant/account")

    // The login email moved; the merchant's business email did not.
    const me = await page.request.get("/api/users/me")
    expect(me.ok()).toBeTruthy()
    expect((await me.json()).email).toBe(newEmail)

    const ownMerchant = await page.request.get("/api/merchants")
    expect((await ownMerchant.json()).data[0].email).toBe(oldEmail)

    // The card shows it after the next load (AuthProvider re-reads
    // /api/users/me on mount).
    await page.reload()
    await expect(page.locator(email.current)).toHaveValue(newEmail)

    // Login credential actually swapped: old address rejected, new accepted.
    const oldRejected = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin: SITE_ORIGIN },
      data: { email: oldEmail, password: PASSWORD },
    })
    expect(oldRejected.ok()).toBeFalsy()
    const newAccepted = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin: SITE_ORIGIN },
      data: { email: newEmail, password: PASSWORD },
    })
    expect(newAccepted.ok()).toBeTruthy()

    // Token expiry: an expired link redirects back to the callback URL with
    // ?error=TOKEN_EXPIRED, which the email card surfaces as a toast.
    const expiredToken = signVerifyToken(
      {
        email: newEmail,
        updateTo: "e2e-expired@example.com",
        requestType: "change-email-verification",
      },
      -60,
    )
    await page.goto(
      `/api/auth/verify-email?token=${expiredToken}&callbackURL=${encodeURIComponent(
        "/merchant/account",
      )}`,
    )
    await expect(
      page.getByText("That verification link has expired"),
    ).toBeVisible()
  })
})
