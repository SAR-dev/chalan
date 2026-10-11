import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { auth } from "../selectors"

// ─── 4201. Build version ──────────────────────────────────────────────────────
//
// The version on the Account page is read from package.json in a *server*
// component and handed to the client as a prop. A unit test that passes the
// prop by hand cannot catch a page forgetting to, or a build where package.json
// is unreachable — both of which surface here and nowhere else.
//
// Every role gets its own /account route, so all four are asserted: the wiring
// is duplicated per route and a missing one is a role that cannot see their
// build.

/** The version the running app reports, as `major.minor.patch`. */
const SEMVER = /v\d+\.\d+\.\d+/

test.describe("4201. Build version", () => {
  test("every role sees the running version on Account", async ({ page }) => {
    const roles = [
      { name: "rider", creds: CREDS.rider, path: "/rider/account" },
      {
        name: "merchant",
        creds: CREDS.merchant,
        path: "/merchant/account",
      },
      {
        name: "warehouse",
        creds: CREDS.warehouseAdmin,
        path: "/warehouse/account",
      },
      { name: "admin", creds: CREDS.superAdmin, path: "/dashboard/account" },
    ]

    for (const role of roles) {
      await login(page, role.creds)
      await page.goto(role.path)
      await waitForAppReady(page)

      await page.locator(auth.accountPreferencesTab).click()
      const build = page.locator(auth.accountBuild)
      await expect(build, `${role.name} has no Build card`).toBeVisible()

      // Semver, not the old `v29` counter — the two are unified now, and this
      // is what would catch the service worker drifting back to its own number.
      await expect(page.locator(auth.accountBuildVersion)).toHaveText(SEMVER)
    }
  })

  test("the displayed version is the one the service worker caches under", async ({
    page,
  }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider/account")
    await waitForAppReady(page)
    await page.locator(auth.accountPreferencesTab).click()

    const shown = await page.locator(auth.accountBuildVersion).innerText()

    // sw.js is served statically, so read it the way the browser would.
    const sw = await page.evaluate(async () => {
      const res = await fetch("/sw.js")
      return res.text()
    })
    const swVersion = /const VERSION = "([^"]*)"/.exec(sw)?.[1]

    // Stated as a mismatch rather than an equality so a failing run says which
    // of the two drifted.
    expect(
      swVersion,
      `sw.js caches "${swVersion}" but the app shows "${shown.trim()}"`,
    ).toBe(shown.replace(/^v/, "").split("•")[0].trim())
  })

  test("the Update button reloads onto a working build", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider/account")
    await waitForAppReady(page)
    await page.locator(auth.accountPreferencesTab).click()

    const before = await page.locator(auth.accountBuildVersion).innerText()

    // Ends in location.reload(); the whole point is that the page comes back
    // usable rather than wedged on the caches it was holding.
    await page.locator(auth.accountBuildUpdate).click()
    await waitForAppReady(page)
    await page.locator(auth.accountPreferencesTab).click()

    await expect(page.locator(auth.accountBuild)).toBeVisible()
    expect(await page.locator(auth.accountBuildVersion).innerText()).toBe(
      before,
    )
  })
})
