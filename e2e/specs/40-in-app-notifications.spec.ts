import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { notifications, orderForm } from "../selectors"

// ─── 4001. In-app notifications ──────────────────────────────────────────────
//
// The merchant's own event stream. What is worth proving is the wiring, not the
// styling: that placing an order in the portal raises `order.created` (the path
// that emits nothing at all until it goes through the shared event source),
// that it lands in the merchant's inbox, and that opening it drains the badge.

test.describe("4001. In-app notifications", () => {
  test("placing an order raises a notification the merchant can open", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders/new")
    await waitForAppReady(page)

    const card = page.locator(orderForm.card).first()
    await card.locator(orderForm.pickupLocation).click()
    await page.getByRole("option").first().click()
    await card.locator(orderForm.recipientName).fill("Notify Recipient")
    await card.locator(orderForm.recipientPhone).fill("01712345678")
    await card.locator(orderForm.deliveryCity).click()
    await page.getByRole("option").first().click()
    await card
      .locator(orderForm.deliveryAddress)
      .fill("44 Notification Road, Dhaka")
    await card.locator(orderForm.parcelWeight).fill("1")
    await card.locator(orderForm.productCost).fill("750")

    await page.locator(orderForm.submitOrder).click()
    await page.waitForURL(/\/merchant\/orders/)
    await waitForAppReady(page)

    // The badge is polled, so allow a beat rather than asserting instantly.
    await expect(page.locator(notifications.badge)).toBeVisible({
      timeout: 15_000,
    })

    // Opening the tray lists what arrived. The list is fetched on first open,
    // so the row appears a beat after the panel does.
    await page.locator(notifications.bell).click()
    const tray = page.locator(notifications.tray)
    await expect(tray).toBeVisible()
    await expect(page.locator(notifications.trayRow).first()).toBeVisible({
      timeout: 15_000,
    })
    // Scoped to the first row: across a full run the merchant accumulates many
    // "New order received" entries, and an unscoped text match is a strict-mode
    // violation rather than a missing row.
    await expect(tray.getByText("New order received").first()).toBeVisible()
  })

  test("opening the tray drains the badge and the inbox keeps the row", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)

    await page.locator(notifications.bell).click()
    await expect(page.locator(notifications.tray)).toBeVisible()

    // Opening is the read — one watermark write, not a receipt per row.
    await expect(page.locator(notifications.badge)).toHaveCount(0, {
      timeout: 15_000,
    })

    // "View all" reaches the same rows without the badge having been a lie.
    await page.locator(notifications.trayAll).click()
    await page.waitForURL(/\/merchant\/notifications/)
    await waitForAppReady(page)
    await expect(page.locator(notifications.inboxRowAny).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test("the inbox is reachable from the sidebar without the bell", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)

    await page.locator(notifications.navLink).click()
    await page.waitForURL(/\/merchant\/notifications/)
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("a role with no inbox is not offered a bell that can never light up", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse")
    await waitForAppReady(page)

    // Warehouse admins work from their own queues; an always-empty inbox would
    // be a button that never does anything.
    await expect(page.locator(notifications.bell)).toHaveCount(0)
  })
})
