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

  test("following a row marks that row read, and leaves the rest alone", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)

    await page.locator(notifications.bell).click()
    await expect(page.locator(notifications.tray)).toBeVisible()

    // Rows carrying the unread marker, so the test can prove a *specific* row
    // changed state rather than that a number moved.
    //
    // The badge is deliberately not the assertion: it caps at "9+", which is a
    // display value, not a count, and parsing it proves nothing.
    const unread = page.locator(notifications.unreadTrayRow)
    await expect(unread.first()).toBeVisible({ timeout: 15_000 })
    const before = await unread.count()

    await unread.first().click()
    await page.waitForURL(/\/merchant\/orders\/.+/, { timeout: 15_000 })

    await page.goto("/merchant/orders")
    await waitForAppReady(page)
    await page.locator(notifications.bell).click()
    await expect(page.locator(notifications.tray)).toBeVisible()

    // Exactly one fewer unread row: reading is per row now, so the others must
    // still be waiting. Under the old watermark model opening the tray would
    // have cleared every row at once.
    await expect(unread).toHaveCount(before - 1, { timeout: 15_000 })

    // And the row is still *there* — read is not archived.
    await expect(page.locator(notifications.trayRow).first()).toBeVisible()
  })

  test("the inbox marks everything read in one click", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/notifications")
    await waitForAppReady(page)

    // Place a parcel so there is something to read, then return to the inbox.
    await page.goto("/merchant/orders/new")
    await waitForAppReady(page)
    const card = page.locator(orderForm.card).first()
    await card.locator(orderForm.pickupLocation).click()
    await page.getByRole("option").first().click()
    await card.locator(orderForm.recipientName).fill("Mark All Recipient")
    await card.locator(orderForm.recipientPhone).fill("01712345678")
    await card.locator(orderForm.deliveryCity).click()
    await page.getByRole("option").first().click()
    await card.locator(orderForm.deliveryAddress).fill("9 Mark All Road, Dhaka")
    await card.locator(orderForm.parcelWeight).fill("1")
    await card.locator(orderForm.productCost).fill("500")
    await page.locator(orderForm.submitOrder).click()
    await page.waitForURL(/\/merchant\/orders/)
    await waitForAppReady(page)

    await page.goto("/merchant/notifications")
    await waitForAppReady(page)
    await expect(page.locator(notifications.inboxRowAny).first()).toBeVisible({
      timeout: 15_000,
    })

    await page.locator(notifications.markAllRead).click()
    await expect(page.locator(notifications.badge)).toHaveCount(0, {
      timeout: 15_000,
    })
    // The rows stay: read is not archived.
    await expect(page.locator(notifications.inboxRowAny).first()).toBeVisible()
  })

  test("a notification can be archived without being read", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/notifications")
    await waitForAppReady(page)

    const rows = page.locator(notifications.inboxRowAny)
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const before = await rows.count()

    await rows.first().hover()
    await page.locator(notifications.archiveAny).first().click()

    // Dismissal is a view filter, not a delete: the row leaves the inbox…
    await expect(rows).toHaveCount(before - 1, { timeout: 15_000 })
    // …and it stops counting towards the badge, whether it had been read or not.
    await expect(page.locator(notifications.badge)).toHaveCount(0, {
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

  test("a notification opens the merchant's order and closes the tray", async ({
    page,
  }) => {
    // Two bugs in one gesture, which is why they are tested together — this is
    // exactly what a merchant does: open the tray, click a row.
    //
    // 1. The link pointed at `/dashboard/orders/…` while notifications are
    //    delivered only to MERCHANT profiles, so the role guard bounced it to
    //    `/merchant` — indistinguishable from a notification that goes nowhere.
    // 2. `next/link` is client-side, so the page never reloads and the Sheet's
    //    own `open` state is never told to change: the tray stayed open on top
    //    of the page it had just opened.
    //
    // Nothing else here could catch either: the tests above assert a row is
    // *visible* and never follow it.
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)

    await page.locator(notifications.bell).click()
    const tray = page.locator(notifications.tray)
    await expect(tray).toBeVisible()

    const rows = page.locator(notifications.trayRow)
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })

    // Prefer an order event: money events legitimately land on /merchant/payouts,
    // so following one would not prove anything about the branch that was wrong.
    const orderRow = rows.filter({ hasText: "Order" }).first()
    const target = (await orderRow.count()) > 0 ? orderRow : rows.first()
    await target.click()

    // Landing anywhere under /merchant/orders means the link resolved to a real
    // order page. The failure mode was a bounce to bare /merchant.
    await page.waitForURL(/\/merchant\/orders\/.+/, { timeout: 15_000 })
    await waitForAppReady(page)
    await expect(page).not.toHaveURL(/\/merchant$/)

    // And the panel has to leave with it. Asserted against the real browser
    // because a portal's unmount timing can differ from jsdom's.
    await expect(tray).toBeHidden({ timeout: 15_000 })
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
