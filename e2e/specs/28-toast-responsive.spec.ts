import { expect, test } from "@playwright/test"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import { settings } from "../selectors"

/**
 * 2801. The toast must be usable on a phone.
 *
 * Layout cannot be asserted in jsdom, so the three requirements — almost full
 * width, a gutter so it does not touch either edge, and correct positioning —
 * are all measured off the real bounding box at explicit viewports.
 *
 * Measurements rather than visual snapshots on purpose: a screenshot passes
 * with a one-pixel gutter, and a toast that overflows by a few pixels still
 * looks right in a PNG while being unusable on the device it targets.
 */

/** Phone portrait — the width the requirement is really about. */
const MOBILE = { width: 375, height: 812 }
/** The narrowest phone still in common use; sonner's own 356px overflows it. */
const SMALL_PHONE = { width: 320, height: 568 }

/**
 * Saves the policy with whatever value is currently shown — an idempotent
 * write, so the toast fires without changing seeded state for other suites.
 */
async function triggerToast(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/settings")
  await waitForAppReady(page)
  await page.locator(settings.savePolicy).click()
  const t = toast(page, "Cancellation policy updated.")
  await expect(t).toBeVisible({ timeout: 15_000 })
  return t.first()
}

async function measure(
  locator: ReturnType<typeof toast>,
): Promise<{ x: number; width: number; right: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error("toast has no bounding box")
  return { x: box.x, width: box.width, right: box.x + box.width }
}

test.describe("2801. Toast responsiveness", () => {
  test.describe("mobile", () => {
    test.use({ viewport: MOBILE })

    test("fills most of the screen width and keeps a gutter on both edges", async ({
      page,
    }) => {
      await login(page, CREDS.superAdmin)
      const t = await triggerToast(page)
      const box = await measure(t)
      const vw = MOBILE.width

      // Almost full width — not the 356px desktop constant.
      expect(box.width).toBeGreaterThanOrEqual(vw * 0.85)
      // Horizontal margins: touching or past either edge is the failure this
      // guards, so both are asserted rather than only "it fits".
      expect(box.x).toBeGreaterThan(0)
      expect(box.right).toBeLessThan(vw)
      // Symmetric enough to look deliberate, not off-centre by a rounding
      // artefact of an over-constrained `left` + `width`.
      expect(box.x).toBeGreaterThanOrEqual(8)
      expect(vw - box.right).toBeGreaterThanOrEqual(8)

      // The dismiss control. Sonner deliberately overhangs it past the toast
      // corner (`--toast-close-button-transform: translate(-35%, -35%)`), so
      // "inside the toast box" is the wrong expectation. What matters is that
      // it stays on screen — and it does precisely because of the gutter: with
      // a 16px margin the button lands at x=10, whereas a tighter one would
      // clip it off the left edge.
      const close = t.locator("button")
      await expect(close).toBeVisible()
      const closeBox = await close.boundingBox()
      expect(closeBox).toBeTruthy()
      expect(closeBox!.x).toBeGreaterThanOrEqual(0)
      expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(vw)
    })

    test("stays inside the screen at the narrowest supported width", async ({
      page,
    }) => {
      await page.setViewportSize(SMALL_PHONE)
      await login(page, CREDS.superAdmin)
      const t = await triggerToast(page)
      const box = await measure(t)
      const vw = SMALL_PHONE.width

      // The real bug this guards: a fixed 356px toast overflows a 320px
      // viewport, pushing the dismiss control off-screen.
      expect(box.width).toBeLessThanOrEqual(vw)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(vw)
      expect(box.width).toBeGreaterThanOrEqual(vw * 0.8)
    })
  })

  test.describe("desktop", () => {
    test("does not stretch to full width", async ({ page }) => {
      await login(page, CREDS.superAdmin)
      const t = await triggerToast(page)
      const box = await measure(t)
      const vw = page.viewportSize()?.width ?? 1280

      // The mobile rule must not leak upward to wide screens, where a
      // full-bleed toast reads as a banner rather than a notification.
      expect(box.width).toBeLessThan(vw * 0.9)
      expect(box.x).toBeGreaterThan(0)
      expect(box.right).toBeLessThan(vw)
    })
  })
})
