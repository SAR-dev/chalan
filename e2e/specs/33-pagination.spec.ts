import "dotenv/config"

import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { orders, pagination } from "../selectors"

// ─── 3301. Server-side pagination ─────────────────────────────────────────────
//
// The four footer controls under every list page carried no
// `data-testid` at all, and `e2e/` never referenced them — so server-side
// pagination, the most-used interaction in the product, had zero coverage.
// A regression in `onPageChange` would have shipped silently.
//
// The result-set size is READ from the footer rather than derived from
// `SEED_COUNTS.orders`: earlier specs in this run create orders, so by the
// time this one executes the database holds more than the seeded 100 and a
// hardcoded page count would be wrong.

const TABLE = "dashboard-orders"
/** `DEFAULT_TABLE_ROWS_PER_PAGE` — what every server-paginated table uses. */
const PAGE_SIZE = 20
const ROWS = `[data-testid^='row-${TABLE}-']`

async function readPage(
  page: import("@playwright/test").Page,
): Promise<{ current: number; total: number }> {
  const text = (
    await page.locator(pagination.pageLabel(TABLE)).innerText()
  ).trim()
  const match = /Page (\d+) of (\d+)/.exec(text)
  expect(match, `unexpected page label: ${text}`).toBeTruthy()
  return { current: Number(match![1]), total: Number(match![2]) }
}

/** First order code visible in the table's current page. */
async function firstRowId(page: import("@playwright/test").Page) {
  const first = page.locator(ROWS).first()
  await expect(first).toBeVisible()
  const testid = await first.getAttribute("data-testid")
  return testid?.replace(`row-${TABLE}-`, "") ?? ""
}

async function openOrdersAsAdmin(page: import("@playwright/test").Page) {
  await login(page, CREDS.superAdmin)
  await page.goto("/dashboard/orders")
  await waitForAppReady(page)
  // The page opens on PENDING, which holds a handful of the seeded orders —
  // often one page. ALL is what makes the table paginated at all.
  await page.locator(orders.tab("ALL")).click()
  await waitForAppReady(page)
}

test.describe("3301. Server-side pagination", () => {
  test("the footer reports the whole result set, not the visible rows", async ({
    page,
  }) => {
    await openOrdersAsAdmin(page)

    const { current, total } = await readPage(page)
    expect(current).toBe(1)
    // More than one page exists, and exactly one page of rows is on screen —
    // the number client-side filtering would have disagreed with the total on.
    expect(total).toBeGreaterThan(1)
    await expect(page.locator(ROWS)).toHaveCount(PAGE_SIZE)
  })

  test("next and previous move through the pages and agree with the label", async ({
    page,
  }) => {
    await openOrdersAsAdmin(page)

    const prev = page.locator(pagination.prev(TABLE))
    const next = page.locator(pagination.next(TABLE))
    const label = page.locator(pagination.pageLabel(TABLE))

    const first = await readPage(page)
    expect(first.current).toBe(1)
    // Page 1: nowhere to go backwards to.
    await expect(prev).toBeDisabled()
    const page1First = await firstRowId(page)

    // The label moves synchronously (local state in `handlePageChange`); the
    // rows arrive with the SWR response. Reading them once races the fetch —
    // which is how this assertion first failed with page 1's row still shown.
    await next.click()
    await expect(label).toHaveText(/Page 2 of \d+/)
    const second = await readPage(page)
    expect(second.current).toBe(2)
    // Same set, further into it — the total must not move when paging.
    expect(second.total).toBe(first.total)
    await expect(prev).toBeEnabled()

    await expect
      .poll(() => firstRowId(page), { timeout: 15_000 })
      .not.toBe(page1First)
    await expect(page.locator(ROWS)).toHaveCount(PAGE_SIZE)
    const page2First = await firstRowId(page)
    expect(page2First).not.toBe(page1First)

    await prev.click()
    await expect(label).toHaveText(/Page 1 of \d+/)
    await expect
      .poll(() => firstRowId(page), { timeout: 15_000 })
      .toBe(page1First)
    const back = await readPage(page)
    expect(back.current).toBe(1)
    expect(back.total).toBe(first.total)
  })

  test("the footer controls are tagged on every list page", async ({
    page,
  }) => {
    await openOrdersAsAdmin(page)
    // The whole point of this spec: these existed in the DOM with no stable
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
