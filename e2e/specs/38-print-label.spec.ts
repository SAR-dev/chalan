import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { ongoing, orderLabel } from "../selectors"

/**
 * The R5 quick-print action, on both surfaces that own a parcel before delivery:
 * the warehouse's order queue + Ongoing board (warehouse admin) and the rider's
 * pickup queue.
 *
 * Printing goes through `window.print()`, which opens a native dialog no test
 * can read. `addInitScript` replaces it with a no-op so the label sheet — the
 * thing under test — stays mounted long enough to assert. The sheet renders only
 * for print, so it is `display: none` on screen: assertions check attachment and
 * content, never visibility.
 *
 * The QR payload is the order reference, which is why the assertions are about
 * the *order id on the sheet* and not a print-time token.
 */

const RIDER_TARGET = "ORD-100010E" // seeded APPROVED, no pickup rider
const RIDER_ID = "RID-100001E" // rider1, seeded PICKUP-only

test.describe("3801. Parcel label quick-print", () => {
  test("a warehouse admin prints from the queue and the board", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => {}
    })
    await login(page, CREDS.warehouseAdmin)

    // 1. The approval/queue table offers the action, one per order.
    await page.goto("/warehouse/orders")
    await waitForAppReady(page)
    const queueButton = page.locator("[data-testid^='order-label-']").first()
    await expect(queueButton).toBeVisible({ timeout: 15_000 })

    // 2. The board offers it on the card, and it prints that card's parcel.
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    await expect(page.locator(ongoing.board)).toBeVisible({ timeout: 15_000 })

    const card = page.locator(ongoing.cardPrefix).first()
    await expect(card).toBeVisible()
    const button = card.locator("[data-testid^='order-label-']")
    await expect(button).toBeVisible()
    const orderId = ((await button.getAttribute("data-testid")) ?? "").replace(
      "order-label-",
      "",
    )
    expect(orderId).toMatch(/^ORD-/)

    await button.click()

    const sheet = page.locator(orderLabel.printRoot)
    await expect(sheet).toHaveCount(1)
    await expect(sheet).toContainText(orderId)
    // The QR is rendered from the same order id, so the scan target and the
    // printed reference cannot disagree.
    await expect(sheet.locator("svg title")).toHaveText(`Parcel ${orderId}`)

    // 3. The order detail page offers single-label print / reprint for a parcel
    //    already in flight.
    await page.goto(`/warehouse/orders/${orderId}`)
    await waitForAppReady(page)
    const detailButton = page.locator(orderLabel.button(orderId))
    await expect(detailButton).toBeVisible({ timeout: 15_000 })
    await detailButton.click()
    await expect(sheet).toHaveCount(1)
    await expect(sheet).toContainText(orderId)
  })

  test("a rider prints from the pickup queue", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {}
    })

    // Seeds do not guarantee a pre-assigned parcel for the pick-up-only rider,
    // so hand one over first — the same endpoint and rider the pickup flow uses.
    await login(page, CREDS.warehouseAdmin)
    const assigned = await page.request.patch(
      `/api/orders/${RIDER_TARGET}/assign-pickup-rider`,
      { data: { riderId: RIDER_ID } },
    )
    expect(assigned.status()).toBe(200)

    await login(page, CREDS.rider)
    await page.goto("/rider/pickup")
    await waitForAppReady(page)

    const button = page.locator(orderLabel.button(RIDER_TARGET))
    await expect(button).toBeVisible({ timeout: 15_000 })

    await button.click()

    const sheet = page.locator(orderLabel.printRoot)
    await expect(sheet).toHaveCount(1)
    await expect(sheet).toContainText(RIDER_TARGET)
  })
})
