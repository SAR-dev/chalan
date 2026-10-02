import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { auth, orders, signOut } from "../selectors"

const DASHBOARD = "/dashboard/orders"

test.describe("S68. Sign-out confirmation", () => {
  test("clicking Sign out asks first instead of ending the session", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto(DASHBOARD)
    await waitForAppReady(page)

    await page.locator(auth.logout).click()
    await expect(page.locator(signOut.dialog)).toBeVisible()

    // The dialog is what stops the click: had sign-out been direct, the page
    // would already be on its way to /login before this assertion runs.
    await expect(page).toHaveURL(new RegExp(DASHBOARD))
    await expect(page.locator(orders.table)).toBeVisible()
  })

  test("cancel closes the dialog and keeps the user signed in", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto(DASHBOARD)
    await waitForAppReady(page)

    await page.locator(auth.logout).click()
    await expect(page.locator(signOut.dialog)).toBeVisible()
    await page.locator(signOut.cancel).click()
    await expect(page.locator(signOut.dialog)).toHaveCount(0)

    expect(page.url()).toContain(DASHBOARD)

    // The real check for "kept logged in": a full reload re-runs the server
    // session gate, so a cancel that had quietly signed the user out would
    // bounce to /login here rather than re-render the table.
    await page.reload()
    await waitForAppReady(page)
    await expect(page).toHaveURL(new RegExp(DASHBOARD))
    await expect(page.locator(orders.table)).toBeVisible()
  })

  test("confirm shows a loading state, signs out, then redirects", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // Slow the sign-out request so the loading UI is observable. Without the
    // delay the whole operation can complete inside one tick and the spinner
    // would never be rendered — the test would still pass while never having
    // exercised the state the requirement asks for.
    await page.route("**/api/auth/sign-out", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })

    await page.goto(DASHBOARD)
    await waitForAppReady(page)
    await page.locator(auth.logout).click()

    const confirm = page.locator(signOut.confirm)
    await expect(confirm).toBeVisible()
    await confirm.click()

    // Loading UI: the action is held (disabled) and shows a spinner while the
    // request is in flight.
    await expect(confirm).toBeDisabled()
    await expect(confirm.locator("svg")).toBeVisible()
    // Cancelling must be impossible mid-flight — a second click would fire a
    // second sign-out and hide what is really happening.
    await expect(page.locator(signOut.cancel)).toBeDisabled()

    await page.waitForURL(/\/login/, { timeout: 15_000 })
  })
})

test.describe("S72. Sign-out confirmation - mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("the mobile menu asks before signing out", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto(DASHBOARD)
    await waitForAppReady(page)

    await page.locator(auth.mobileMenu).click()
    await page.locator(auth.mobileLogout).click()

    // The confirmation lives outside <Sheet>, so closing the menu must not
    // take the dialog with it — this assertion is what proves it didn't.
    await expect(page.locator(signOut.dialog)).toBeVisible()

    await page.locator(signOut.confirm).click()
    await page.waitForURL(/\/login/, { timeout: 15_000 })
  })
})
