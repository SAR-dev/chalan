import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { ongoing, orderLabel } from "../selectors"

/**
 * The R5 quick-print action, on both surfaces that own a parcel before delivery:
 * the warehouse's order queue + Ongoing board (warehouse admin) and the rider's
 * pickup queue.
 *
 * The pdfme engine generates a vector PDF and hands it to the browser's print
 * dialog, so there is no DOM sheet to assert on — the label is a binary blob,
 * not markup. What the test can verify is that the action is offered on every
 * surface and that triggering it does not blow up. The PDF's *contents*
 * (page size, QR clamp, one page per input) are asserted in
 * `src/lib/label/generate-pdf.spec.ts`, which parses the produced file; the
 * binding rules are asserted in `label-inputs.spec.ts`.
 *
 * `downloadPdf` is stubbed per-page because it creates an object URL and clicks
 * a synthetic anchor — the browser then handles it, which is exactly the part
 * that is not ours to assert. The Print button additionally opens a real
 * dialog, so it is clicked but never awaited.
 */

const RIDER_TARGET = "ORD-100010E" // seeded APPROVED, no pickup rider
const RIDER_ID = "RID-100001E" // rider1, seeded PICKUP-only

/** Neutralize the two sinks that leave the page: the print dialog and the download. */
async function stubPrintAndDownload(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.print = () => {}
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function stubbed(
      this: HTMLAnchorElement,
    ) {
      // Blob downloads only; let every other synthetic click behave normally.
      if (this.download && this.href.startsWith("blob:")) return
      realClick.call(this)
    }
  })
}

test.describe("3801. Parcel label quick-print", () => {
  test("a warehouse admin can print from the queue and the board", async ({
    page,
  }) => {
    await stubPrintAndDownload(page)
    await login(page, CREDS.warehouseAdmin)

    // 1. The approval/queue table offers the action, one per order.
    await page.goto("/warehouse/orders")
    await waitForAppReady(page)
    const queueButton = page.locator("[data-testid^='order-label-']").first()
    await expect(queueButton).toBeVisible({ timeout: 15_000 })
    // Print and Download both ride along, since every label is a real PDF now.
    const queueOrderId = ((await queueButton.getAttribute("data-testid")) ?? "")
      .replace("order-label-", "")
      .replace("-download", "")
    await expect(page.locator(orderLabel.download(queueOrderId))).toBeAttached({
      timeout: 15_000,
    })

    // 2. The board offers it on the card, and it prints that card's parcel.
    await page.goto("/warehouse/ongoing")
    await waitForAppReady(page)
    await expect(page.locator(ongoing.board)).toBeVisible({ timeout: 15_000 })

    const card = page.locator(ongoing.cardPrefix).first()
    await expect(card).toBeVisible()
    const button = card.locator("[data-testid^='order-label-']").first()
    await expect(button).toBeVisible()
    const orderId = ((await button.getAttribute("data-testid")) ?? "").replace(
      "order-label-",
      "",
    )
    expect(orderId).toMatch(/^ORD-/)

    await button.click()
    await expect(button).toBeEnabled()

    // 3. The order detail page offers single-label print / reprint for a parcel
    //    already in flight.
    await page.goto(`/warehouse/orders/${orderId}`)
    await waitForAppReady(page)
    const detailButton = page.locator(orderLabel.button(orderId))
    await expect(detailButton).toBeVisible({ timeout: 15_000 })
    await detailButton.click()
    await expect(detailButton).toBeEnabled()
  })

  test("a rider prints from the pickup queue", async ({ page }) => {
    await stubPrintAndDownload(page)

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
    await expect(button).toBeEnabled()
  })
})
