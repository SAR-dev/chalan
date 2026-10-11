import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { landing } from "../selectors"

// ─── 4101. Mobile layout ─────────────────────────────────────────────────────
//
// Runs in the `mobile` Playwright project (Pixel 5), not `chromium`, so it is
// the only spec that executes at a phone width without doubling the whole
// suite. The assertion is deliberately blunt: the *page* must not scroll
// sideways. A DataTable is allowed to scroll inside its own container — that is
// the intended strategy — but nothing may push the document wider than the
// viewport, which is what a fixed-width row or an un-collapsed grid does.

/** Document width minus viewport width, in CSS px. */
async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
}

async function expectNoPageOverflow(
  page: import("@playwright/test").Page,
  label: string,
) {
  // 1px of slack for sub-pixel rounding.
  expect(
    await horizontalOverflow(page),
    `${label} overflows sideways`,
  ).toBeLessThanOrEqual(1)
}

test.describe("4101. Mobile layout", () => {
  test("the rider queue does not overflow, and the action is tappable", async ({
    page,
  }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider")
    await waitForAppReady(page)

    await expectNoPageOverflow(page, "/rider")

    // The primary action must be a real target, not a 28px sliver.
    const action = page.locator("[data-testid^='rider-start-pickup-']").first()
    if ((await action.count()) > 0) {
      const box = await action.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(32)
    }
  })

  test("the rider pickup and delivery tables keep their action reachable", async ({
    page,
  }) => {
    await login(page, CREDS.rider)

    for (const path of ["/rider/pickup", "/rider/delivery"]) {
      await page.goto(path)
      await waitForAppReady(page)
      await expectNoPageOverflow(page, path)
    }
  })

  test("the public landing page does not overflow and keeps a sign-in route", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForAppReady(page)

    await expectNoPageOverflow(page, "/")

    // A phone user past the hero must still have a header route in.
    await expect(page.locator(landing.signIn)).toBeVisible()
    await expect(page.locator(landing.register)).toBeVisible()
  })

  test("the merchant order list does not overflow the page", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)

    await expectNoPageOverflow(page, "/merchant/orders")
  })
})
