import "dotenv/config"

import { expect, test } from "@playwright/test"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import { dashboard, settings } from "../selectors"

/**
 * Zone-pricing coverage and the settings split (2601–2602).
 *
 * Delivery, COD and cancellation rates are per-lane `zone_pricing` rows with no
 * platform-wide fallback, so the super admin needs a place to see which lanes
 * are still unpriced, and the settings page keeps only the one platform policy
 * left — whether a cancelled order is refunded.
 */

test.describe("2601. Zone pricing coverage checklist", () => {
  test("the dashboard lists lanes with no configured rate", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard")
    await waitForAppReady(page)

    await expect(page.locator(dashboard.pricingCoverageCard)).toBeVisible()

    // The seed ships a full origin×destination matrix for the reachable lanes
    // (zones a warehouse can ship from × zones a city sits in), so with clean
    // seed data there is nothing to configure. Assert the *shape* rather than a
    // count: adding a warehouse or zone legitimately changes the number.
    await expect(page.locator(dashboard.pricingCoverageMissing)).toHaveCount(0)
    await expect(page.locator(dashboard.pricingCoverageCard)).toContainText(
      /All \d+ reachable route[s]? have a rate\./,
    )
  })

  test("only a super admin can read the coverage endpoint", async ({
    page,
    request,
  }) => {
    // No session at all.
    expect((await request.get("/api/admin/pricing-coverage")).status()).toBe(
      401,
    )

    // A signed-in merchant still gets nothing.
    await login(page, CREDS.merchant)
    expect(
      (await page.request.get("/api/admin/pricing-coverage")).status(),
    ).toBe(403)
  })
})

test.describe("2602. Settings — cancellation policy", () => {
  test("settings keeps the cancellation policy, not a platform-wide price list", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // The page renders a placeholder switch until `/api/platform-config`
    // resolves — it cannot show a truthful toggle state before then, so only
    // that row is withheld (the header and card still render). Arm the
    // listener BEFORE the navigation so the response cannot be missed, and
    // fail with a precise timeout if the request never happens at all.
    const loaded = page.waitForResponse(
      (res) =>
        res.url().includes("/api/platform-config") && res.status() === 200,
      { timeout: 30_000 },
    )
    await page.goto("/dashboard/settings")
    await loaded

    await expect(page.locator(settings.cancellationPolicyCard)).toBeVisible()
    await expect(page.locator(settings.refundOnCancel)).toBeVisible()

    // The "Default merchant pricing" card is gone: those rates were a fallback
    // the server no longer honours, so showing them would be a lie.
    await expect(page.getByText("Default merchant pricing")).toHaveCount(0)
    await expect(page.getByText("Base rate (TK)")).toHaveCount(0)
    await expect(page.getByText("Free weight (KG)")).toHaveCount(0)

    const toggle = page.locator(settings.refundOnCancel)
    const save = page.locator(settings.savePolicy)

    // Saving re-fetches the config, and the page re-syncs the toggle from it. The
    // success toast only fires after that re-fetch has settled, so waiting for it
    // is also what makes the next click safe — clicking before the re-fetch lands
    // would be overwritten by the authoritative value.
    const savePolicy = async () => {
      await save.click()
      await expect(toast(page, "Cancellation policy updated.")).toBeVisible()
    }

    // Normalise to ON first. The page only renders the switch once the config
    // has loaded, so it shows the authoritative value — which means the save
    // below always writes a value opposite to the one it started from, and the
    // reload can only read it back if the write actually persisted.
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click()
      await savePolicy()
      await expect(toggle).toHaveAttribute("aria-checked", "true")
    }

    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await savePolicy()

    // Re-read from the database: if the switch came back ON, this is optimistic
    // state rather than a persisted policy.
    const reloaded = page.waitForResponse(
      (res) =>
        res.url().includes("/api/platform-config") && res.status() === 200,
      { timeout: 30_000 },
    )
    await page.reload()
    await reloaded
    await expect(page.locator(settings.cancellationPolicyCard)).toBeVisible()
    await expect(page.locator(settings.refundOnCancel)).toHaveAttribute(
      "aria-checked",
      "false",
    )

    // Leave the seeded default intact for other suites.
    await page.locator(settings.refundOnCancel).click()
    await savePolicy()
    await expect(page.locator(settings.refundOnCancel)).toHaveAttribute(
      "aria-checked",
      "true",
    )
  })
})
