import { expect, type Page, test } from "@playwright/test"
import { totpSecretFromUri } from "@/lib/two-factor"
import { CREDS, type E2ECredential, login, waitForAppReady } from "../helpers"
import { auth, signOut, topnav, twoFactor } from "../selectors"
import { totp } from "../totp"

const AUTHENTICATED_URL = /\/(merchant|dashboard|warehouse|rider|welcome)/

async function openTwoFactorTab(page: Page, path = "/dashboard/account") {
  await page.goto(path)
  await waitForAppReady(page)
  await page.locator(auth.accountTwoFactorTab).click()
  // Let /api/users/me settle so status/policy assertions see fresh flags.
  await waitForAppReady(page)
  await expect(page.locator(twoFactor.status)).toBeVisible()
}

/** Reads the live TOTP secret for the signed-in user (recovery path). */
async function fetchTotpSecret(
  page: Page,
  cred: E2ECredential,
): Promise<string> {
  const res = await page.request.post("/api/auth/two-factor/get-totp-uri", {
    data: { password: cred.password },
  })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { totpURI?: string }
  const secret = body.totpURI ? totpSecretFromUri(body.totpURI) : null
  expect(secret).toBeTruthy()
  return secret as string
}

/** Best-effort: leave the seeded users without 2FA after every attempt. */
async function disableIfEnrolled(page: Page) {
  try {
    const me = await page.request.get("/api/users/me")
    if (!me.ok()) return
    const body = (await me.json()) as {
      twoFactorEnabled?: boolean
      role?: string
    }
    if (body.twoFactorEnabled !== true) return
    const cred = body.role === "MERCHANT" ? CREDS.merchant : CREDS.superAdmin
    const secret = await fetchTotpSecret(page, cred)
    await page.request.post("/api/account/two-factor/disable", {
      data: { code: totp(secret) },
    })
  } catch {
    // Cleanup is best effort — the next run reseeds the database anyway.
  }
}

test.describe("S37. Two-factor authentication", () => {
  test.afterEach(async ({ page }) => {
    await disableIfEnrolled(page)
  })

  test("no policy line when ADMIN_2FA_REQUIRED is unset, status visible", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await openTwoFactorTab(page)

    await expect(page.locator(twoFactor.status)).toHaveText("Disabled")
    await expect(page.locator(twoFactor.enableButton)).toBeVisible()
    // Env policy off → the deployment-policy line must not render.
    await expect(page.locator(twoFactor.policy)).toHaveCount(0)
  })

  test("admin enrolls in 2FA and signs in with a TOTP code", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await openTwoFactorTab(page)
    await expect(page.locator(twoFactor.status)).toHaveText("Disabled")

    // ── Enroll ────────────────────────────────────────────────────────────
    await page.locator(twoFactor.enableButton).click()
    await page.locator(twoFactor.passwordInput).fill(CREDS.superAdmin.password)
    await page.locator(twoFactor.passwordSubmit).click()

    const secretInput = page.locator(twoFactor.secret)
    await expect(secretInput).toBeVisible({ timeout: 15_000 })
    // QR shows the same otpauth URI — scannable instead of copying the key
    await expect(page.locator(twoFactor.qr)).toBeVisible()
    const secret = (await secretInput.inputValue()).trim()
    expect(secret).toMatch(/^[A-Z2-7]+$/)

    await page.locator(twoFactor.codeInput).fill(totp(secret))
    await page.locator(twoFactor.verifySubmit).click()

    // ── Recovery codes are shown exactly once ─────────────────────────────
    const recoveryCodes = page.locator(twoFactor.recoveryCodes)
    await expect(recoveryCodes).toBeVisible({ timeout: 15_000 })
    await expect(recoveryCodes).toContainText(/[A-Za-z0-9]{5}-[A-Za-z0-9]{5}/)
    await expect(page.locator(twoFactor.recoveryCopy)).toBeVisible()

    // Download as .txt
    const downloadPromise = page.waitForEvent("download")
    await page.locator(twoFactor.recoveryDownload).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("two-factor-recovery-codes.txt")

    await page.locator(twoFactor.recoveryDone).click()
    await expect(page.locator(twoFactor.status)).toHaveText("Enabled")

    // ── Sign out ──────────────────────────────────────────────────────────
    // Sign out lives in the RightNav panel behind the TopNav avatar. It is
    // confirmed first, so the click opens a dialog rather than ending the
    // session — the redirect only follows the confirm.
    await page.locator(topnav.userMenu).click()
    await page.locator(auth.logout).click()
    await expect(page.locator(signOut.confirm)).toBeVisible()
    await page.locator(signOut.confirm).click()
    await page.waitForURL(/\/login/, { timeout: 15_000 })

    // ── Sign in again — password step is followed by a 2FA challenge ─────
    await page.locator(auth.loginEmail).fill(CREDS.superAdmin.email)
    const passwordInput = page.locator(auth.loginPassword)
    await passwordInput.waitFor({ state: "visible" })
    await passwordInput.fill(CREDS.superAdmin.password)
    await passwordInput.press("Enter")

    await expect(page.locator(twoFactor.loginInput)).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator(twoFactor.loginRecoveryLink)).toBeVisible()
    await page.locator(twoFactor.loginInput).fill(totp(secret))
    await page.locator(twoFactor.loginSubmit).click()

    await page.waitForURL(AUTHENTICATED_URL, { timeout: 15_000 })
    await waitForAppReady(page)
    expect(page.url()).toContain("/dashboard")

    // ── Disable again (leaves the seeded admin clean) ─────────────────────
    await openTwoFactorTab(page)
    await expect(page.locator(twoFactor.status)).toHaveText("Enabled")
    await page.locator(twoFactor.disableButton).click()
    await page.locator(twoFactor.disableInput).fill(totp(secret))
    await page.locator(twoFactor.disableSubmit).click()
    await expect(page.locator(twoFactor.status)).toHaveText("Disabled", {
      timeout: 15_000,
    })
  })

  test("merchant can opt into 2FA and signs in with a TOTP code", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)

    // ── Opt in from the merchant account page ─────────────────────────────
    await openTwoFactorTab(page, "/merchant/account")
    await expect(page.locator(twoFactor.status)).toHaveText("Disabled")

    await page.locator(twoFactor.enableButton).click()
    await page.locator(twoFactor.passwordInput).fill(CREDS.merchant.password)
    await page.locator(twoFactor.passwordSubmit).click()

    const secretInput = page.locator(twoFactor.secret)
    await expect(secretInput).toBeVisible({ timeout: 15_000 })
    const secret = (await secretInput.inputValue()).trim()

    await page.locator(twoFactor.codeInput).fill(totp(secret))
    await page.locator(twoFactor.verifySubmit).click()

    await expect(page.locator(twoFactor.recoveryCodes)).toBeVisible({
      timeout: 15_000,
    })
    await page.locator(twoFactor.recoveryDone).click()
    await expect(page.locator(twoFactor.status)).toHaveText("Enabled")

    // ── Fresh sign-in must challenge the merchant too (role-agnostic) ─────
    await page.context().clearCookies()
    await page.goto("/login")
    await page.locator(auth.loginEmail).fill(CREDS.merchant.email)
    const passwordInput = page.locator(auth.loginPassword)
    await passwordInput.waitFor({ state: "visible" })
    await passwordInput.fill(CREDS.merchant.password)
    await passwordInput.press("Enter")

    await expect(page.locator(twoFactor.loginInput)).toBeVisible({
      timeout: 15_000,
    })
    await page.locator(twoFactor.loginInput).fill(totp(secret))
    await page.locator(twoFactor.loginSubmit).click()
    await page.waitForURL(AUTHENTICATED_URL, { timeout: 15_000 })
    await waitForAppReady(page)

    // ── Disable again (leaves the seeded merchant clean) ──────────────────
    await openTwoFactorTab(page, "/merchant/account")
    await expect(page.locator(twoFactor.status)).toHaveText("Enabled")
    await page.locator(twoFactor.disableButton).click()
    await page.locator(twoFactor.disableInput).fill(totp(secret))
    await page.locator(twoFactor.disableSubmit).click()
    await expect(page.locator(twoFactor.status)).toHaveText("Disabled", {
      timeout: 15_000,
    })
  })
})
