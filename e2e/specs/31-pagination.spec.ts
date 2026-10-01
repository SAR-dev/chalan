import "dotenv/config"

import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { orders, pagination } from "../selectors"

// ─── S73. Server-side pagination ─────────────────────────────────────────────
//
// Roadmap R1.3. The four footer controls under every list page carried no
// `data-testid` at all, and `e2e/` never referenced them — so server-side
// pagination, the most-used interaction in the product, had zero coverage.
// A regression in `onPageChange` would have shipped silently.

const TABLE = "dashboard-orders"
/** `SEED_COUNTS.orders` is 100 → five pages at the default size of 20. */
const TOTAL = 100

/** First order code visible in the table's current page. */
async function firstRowId(page: import("@playwright/test").Page) {
  const first = page.locator(`[data-testid^='row-${TABLE}-']`).first()
  await expect(first).toBeVisible()
  const testid = await first.getAttribute("data-testid")
  return testid?.replace(`row-${TABLE}-`, "") ?? ""
}

async function openOrdersAsAdmin(page: import("@playwright/test").Page) {
  await login(page, CREDS.superAdmin)
  await page.goto("/dashboard/orders")
  await waitForAppReady(page)
  // The page opens on PENDING, which holds only 8 of the 100 seeded orders —
  // one page. ALL is what makes the table paginated at all.
  await page.locator(orders.tab("ALL")).click()
  await waitForAppReady(page)
}

test.describe("S73. Server-side pagination", () => {
  test("the footer reports the whole result set, not the visible rows", async ({
    page,
  }) => {
    await openOrdersAsAdmin(page)

    const label = page.locator(pagination.pageLabel(TABLE))
    await expect(label).toHaveText(`Page 1 of ${Math.ceil(TOTAL / 20)}`)
    // 20 rows on screen, 100 in the set — the number the old client-side
    // filtering would have disagreed with.
    await expect(page.locator(`[data-testid^='row-${TABLE}-']`)).toHaveCount(20)
  })

  test("next and previous move through the pages and agree with the label", async ({
    page,
  }) => {
    await openOrdersAsAdmin(page)

    const prev = page.locator(pagination.prev(TABLE))
    const next = page.locator(pagination.next(TABLE))
    const label = page.locator(pagination.pageLabel(TABLE))

    // Page 1: nowhere to go backwards to.
    await expect(prev).toBeDisabled()
    const page1First = await firstRowId(page)

    await next.click()
    await expect(label).toHaveText(`Page 2 of ${Math.ceil(TOTAL / 20)}`)
    await expect(prev).toBeEnabled()

    const page2First = await firstRowId(page)
    expect(page2First).not.toBe(page1First)
    await expect(page.locator(`[data-testid^='row-${TABLE}-']`)).toHaveCount(20)

    await prev.click()
    await expect(label).toHaveText(`Page 1 of ${Math.ceil(TOTAL / 20)}`)
    expect(await firstRowId(page)).toBe(page1First)
  })

  test("the footer controls are tagged on every list page", async ({
    page,
  }) => {
    await openOrdersAsAdmin(page)
    // The whole point of R1.3: these four existed in the DOM with no stable
    // selector, so nothing could ever have pinned their behaviour.
    for (const control of [
      pagination.prev(TABLE),
      pagination.next(TABLE),
      pagination.pageLabel(TABLE),
    ]) {
      await expect(page.locator(control), control).toHaveCount(1)
    }
  })
})
