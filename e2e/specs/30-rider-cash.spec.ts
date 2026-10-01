import "dotenv/config"

import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { riderCash } from "../selectors"

const CASH_URL = "/warehouse/rider-cash"
const CASH_API = "/api/riders/cash"

/**
 * Warehouse rider-cash holdings (S71).
 *
 * The page used to hold its rows in `useState` behind a local `loading` flag and
 * gate the entire table on it, so any remount replaced rows the server still had
 * with a full-page spinner — the same drift the mail-config table had. It is now
 * on SWR, whose cache lives above the component, so a remount reads the last
 * response back synchronously.
 *
 * Asserted here at the browser level, because the failure was a *transient*: the
 * spinner is on screen for a handful of frames and then the rows arrive, so a
 * unit test that waits for content never sees it. `waitFor` therefore must not
 * be the thing under test — the claims below are that the settled state is
 * correct and that the loading state is absent once data exists.
 *
 * The page also had no inbound nav link at all — it was reachable only by typing
 * the URL, so the sidebar entry is asserted here too.
 */
test.describe("S71. Warehouse rider cash holdings", () => {
  test("is reachable from the warehouse sidebar", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse")
    await waitForAppReady(page)

    await page.locator(riderCash.navLink).click()
    await page.waitForURL(`**${CASH_URL}`)
    await expect(page.locator(riderCash.page)).toBeVisible()
  })

  test("renders the holdings for the signed-in warehouse admin", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto(CASH_URL)
    await waitForAppReady(page)

    await expect(page.locator(riderCash.page)).toBeVisible()
    await expect(page.locator(riderCash.totalOnHand)).toBeVisible()
    await expect(page.locator(riderCash.totalCollected)).toBeVisible()
    await expect(page.locator(riderCash.totalSubmitted)).toBeVisible()

    // The seed gives the hub a full roster, so this warehouse has a populated
    // table rather than the empty state. Assert the settled state, never a wait
    // for it.
    await expect(page.locator(riderCash.table)).toBeVisible()
    await expect(page.locator(riderCash.empty)).toHaveCount(0)
    await expect(page.locator(riderCash.error)).toHaveCount(0)

    // The table agrees with the endpoint it reads. Counting against the response
    // rather than a hardcoded number, so adding a rider to the seed does not
    // break this — and so a row silently dropped in rendering is still caught.
    const expected = (await (await page.request.get(CASH_API)).json()) as {
      riderId: string
    }[]
    expect(expected.length).toBeGreaterThan(0)

    // Each row is one rider, addressed by the id the endpoint returned.
    const rows = page.locator("[data-testid^='rider-cash-row-']")
    await expect(rows).toHaveCount(expected.length)
    for (const rider of expected) {
      await expect(page.locator(riderCash.row(rider.riderId))).toBeVisible()
    }

    // Rider, three money columns, status.
    await expect(rows.first().locator("td")).toHaveCount(5)
  })

  // The regression. Navigating away and back remounts the page, which under
  // `useState` meant an empty list and a spinner for data the server still had.
  // With SWR the rows are on screen before any request settles.
  test("keeps the rows when the page is remounted", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto(CASH_URL)
    await waitForAppReady(page)
    await expect(page.locator(riderCash.table)).toBeVisible()

    // Hold the next response open so a remount that blanks would be caught
    // rather than papered over by a request that lands instantly.
    await page.route(`**${CASH_API}`, async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue()
    })

    // Sidebar clicks, not `page.goto`: a full document load tears down the JS
    // context and its SWR cache along with it, which would make this a cold boot
    // rather than the remount under test.
    await page.locator("[data-testid='nav-/warehouse']").click()
    await page.waitForURL(/\/warehouse$/)
    await page.locator(riderCash.navLink).click()
    await page.waitForURL(`**${CASH_URL}`)

    // Present before the held response lands: this is the claim. A `useState`
    // list cannot make it, because the new mount's first commit is `[]` with
    // loading true — its rows appear only once the 3s response arrives.
    await expect(
      page.locator("[data-testid^='rider-cash-row-']").first(),
    ).toBeVisible({ timeout: 1_000 })
    await expect(page.locator(riderCash.loading)).toHaveCount(0)

    await page.unroute(`**${CASH_API}`)
  })

  test("totals are money figures, not raw numbers or placeholders", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto(CASH_URL)
    await waitForAppReady(page)

    // Cash on hand is collected minus submitted, so the seed's figures are
    // non-zero and must come back through formatTk — "139,300 TK", not "139300"
    // and not "NaN" from summing a null aggregate. The suffix mirrors
    // `CURRENCY_SUFFIX` in src/lib/constants, which e2e specs do not import.
    const onHand = page.locator(riderCash.totalOnHand)
    await expect(onHand).toHaveText(/^\d{1,3}(,\d{3})*\sTK$/)
    await expect(onHand).not.toHaveText(/NaN|Infinity|undefined/)
  })

  // The old code swallowed a failed request into `setCashData([])`, which showed
  // "No rider cash data available." for a server error — indistinguishable from a
  // warehouse that genuinely has no riders holding cash.
  test("reports a failed load instead of claiming there is no data", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.route(`**${CASH_API}`, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      }),
    )

    await page.goto(CASH_URL)
    await waitForAppReady(page)

    await expect(page.locator(riderCash.error)).toBeVisible()
    await expect(page.locator(riderCash.empty)).toHaveCount(0)
  })

  test("a merchant gets no holdings, an anonymous caller gets nothing", async ({
    page,
    request,
  }) => {
    // No session at all.
    expect((await request.get(CASH_API)).status()).toBe(401)

    // A signed-in merchant is answered with an empty list, not the data.
    await login(page, CREDS.merchant)
    const res = await page.request.get(CASH_API)
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
