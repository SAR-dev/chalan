import { expect, type Page, test } from "@playwright/test"
import { totpSecretFromUri } from "@/lib/two-factor"
import { CREDS, login } from "../helpers"
import { auth, twoFactor } from "../selectors"
import { totp } from "../totp"

const AUTHENTICATED_URL = /\/(merchant|dashboard|warehouse|rider|welcome)/

async function openSecurityTab(page: Page) {
  await page.goto("/dashboard/account")
  await page.waitForLoadState("networkidle")
  await page.locator(auth.accountSecurityTab).click()
  await expect(page.locator(twoFactor.status)).toBeVisible()
}

/** Reads the live TOTP secret for the signed-in admin (recovery path). */
async function fetchTotpSecret(page: Page): Promise<string> {
  const res = await page.request.post("/api/auth/two-factor/get-totp-uri", {
    data: { password: CREDS.superAdmin.password },
  })
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { totpURI?: string }
  const secret = body.totpURI ? totpSecretFromUri(body.totpURI) : null
  expect(secret).toBeTruthy()
  return secret as string
}

/** Best-effort: leave the seeded admin without 2FA after every attempt. */
async function disableIfEnrolled(page: Page) {
  try {
    const me = await page.request.get("/api/users/me")
    if (!me.ok()) return
    const body = (await me.json()) as { twoFactorEnabled?: boolean }
    if (body.twoFactorEnabled !== true) return
    const secret = await fetchTotpSecret(page)
    await page.request.post("/api/account/two-factor/disable", {
      data: { code: totp(secret) },
    })
  } catch {
    // Cleanup is best effort — the next run reseeds the database anyway.
  }
}

test.describe("S37. Two-factor authentication for admins", () => {
  test.afterEach(async ({ page }) => {
    await disableIfEnrolled(page)
  })

  test("require-2FA toggle is visible for super admins and off by default", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await openSecurityTab(page)

    const toggle = page.locator(twoFactor.requireToggle)
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
  })

  test("admin enrolls in 2FA and signs in with a TOTP code", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await openSecurityTab(page)
    await expect(page.locator(twoFactor.status)).toHaveText("Disabled")

    // ── Enroll ────────────────────────────────────────────────────────────
    await page.locator(twoFactor.enableButton).click()
    await page.locator(twoFactor.passwordInput).fill(CREDS.superAdmin.password)
    await page.locator(twoFactor.passwordSubmit).click()

    const secretInput = page.locator(twoFactor.secret)
    await expect(secretInput).toBeVisible({ timeout: 15_000 })
    const secret = (await secretInput.inputValue()).trim()
    expect(secret).toMatch(/^[A-Z2-7]+$/)

    await page.locator(twoFactor.codeInput).fill(totp(secret))
    await page.locator(twoFactor.verifySubmit).click()

    // ── Recovery codes are shown exactly once ─────────────────────────────
    const recoveryCodes = page.locator(twoFactor.recoveryCodes)
    await expect(recoveryCodes).toBeVisible({ timeout: 15_000 })
    await expect(recoveryCodes).toContainText(/[A-Za-z0-9]{5}-[A-Za-z0-9]{5}/)
    await expect(page.locator(twoFactor.recoveryCopy)).toBeVisible()
    await page.locator(twoFactor.recoveryDone).click()
    await expect(page.locator(twoFactor.status)).toHaveText("Enabled")

    // ── Sign out ──────────────────────────────────────────────────────────
    await page.locator(auth.logout).click()
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
    await page.waitForLoadState("networkidle")
    expect(page.url()).toContain("/dashboard")

    // ── Disable again (leaves the seeded admin clean) ─────────────────────
    await openSecurityTab(page)
    await expect(page.locator(twoFactor.status)).toHaveText("Enabled")
    await page.locator(twoFactor.disableButton).click()
    await page.locator(twoFactor.disableInput).fill(totp(secret))
    await page.locator(twoFactor.disableSubmit).click()
    await expect(page.locator(twoFactor.status)).toHaveText("Disabled", {
      timeout: 15_000,
    })
  })
})
