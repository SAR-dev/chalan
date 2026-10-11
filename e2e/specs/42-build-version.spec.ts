import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { topnav } from "../selectors"

// ─── 4201. Build version ──────────────────────────────────────────────────────
//
// The version in the top bar is read from package.json in a *server* layout and
// handed down through the shell as a prop. A unit test that passes the prop by
// hand cannot catch a layout forgetting to, or a build where package.json is
// unreachable — both surface here and nowhere else.
//
// Every role gets its own shell, so all four are asserted: the wiring is
// duplicated per layout and a missing one is a role who cannot see their build.

/** The version the running app reports, as `major.minor.patch`. */
const SEMVER = /v\d+\.\d+\.\d+/

test.describe("4201. Build version", () => {
  test("every role sees the version in the top bar", async ({ page }) => {
    const roles = [
      { name: "rider", creds: CREDS.rider, home: "/rider" },
      { name: "merchant", creds: CREDS.merchant, home: "/merchant" },
      {
        name: "warehouse",
        creds: CREDS.warehouseAdmin,
        home: "/warehouse",
      },
      { name: "admin", creds: CREDS.superAdmin, home: "/dashboard" },
    ]

    for (const role of roles) {
      await login(page, role.creds)
      await page.goto(role.home)
      await waitForAppReady(page)

      const badge = page.locator(topnav.versionBadge)
      await expect(badge, `${role.name} has no version badge`).toBeVisible()
      // Just the version in the bar — no commit.
      await expect(badge).toHaveText(SEMVER)
      await expect(badge).not.toContainText("•")
    }
  })

  test("the dialog reveals the full details", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider")
    await waitForAppReady(page)

    await expect(page.locator(topnav.versionDialog)).toBeHidden()
    await page.locator(topnav.versionBadge).click()

    await expect(page.locator(topnav.versionDialog)).toBeVisible()
    await expect(page.locator(topnav.versionDialogValue)).toHaveText(SEMVER)
    await expect(page.locator(topnav.versionUpdate)).toBeEnabled()
  })

  test("the displayed version is the one the service worker caches under", async ({
    page,
  }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider")
    await waitForAppReady(page)
    await page.locator(topnav.versionBadge).click()

    const shown = await page.locator(topnav.versionDialogValue).innerText()

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

  test("Update reloads onto a working build", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider")
    await waitForAppReady(page)

    await page.locator(topnav.versionBadge).click()
    const before = await page.locator(topnav.versionDialogValue).innerText()

    // Ends in location.reload(); the whole point is that the page comes back
    // usable rather than wedged on the caches it was holding.
    await page.locator(topnav.versionUpdate).click()
    await waitForAppReady(page)

    await expect(page.locator(topnav.versionBadge)).toBeVisible()
    expect(await page.locator(topnav.versionBadge).innerText()).toBe(
      before.replace(/ •.*/, ""),
    )
  })
})
