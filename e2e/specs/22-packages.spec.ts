import "dotenv/config"

import { expect, type Page, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS, login, waitForAppReady } from "../helpers"
import { dialog, onboarding, packages } from "../selectors"

/**
 * Package catalogue / purchase request flow (S58–S60).
 *
 * Package ids are seeded by `src/lib/db/seed/packages.ts` and are stable, so the
 * specs address rows and cards by id rather than by copy.
 */
const STARTER = "PKG-100001E"
const GROWTH = "PKG-100002E"
const ENTERPRISE = "PKG-100003E"

const MERCHANT_2 = {
  email: "merchant2@email.com",
  password: "12qwaszx",
  home: "/merchant",
}
const MERCHANT_3 = {
  email: "merchant3@email.com",
  password: "12qwaszx",
  home: "/merchant",
}

const MERCHANT_2_NAME = "Merchant 2 Business"
const MERCHANT_3_NAME = "Merchant 3 Business"

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set - .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * The S59 flow leaves MERCHANT_3 holding a live bundle and the approval credit
 * that paid for it, so a CI retry would start from the wrong state (the test
 * asserts "no bundle yet"). Reset that merchant's package state and rebuild the
 * balance from the ledger, the same way the payouts suite does.
 */
async function resetMerchant3Packages(): Promise<void> {
  await withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM merchant WHERE email = $1`,
      ["merchant3@email.com"],
    )
    const merchantId = rows[0]?.id as string | undefined
    if (!merchantId) return

    await client.query(`DELETE FROM merchant_package WHERE "merchantId" = $1`, [
      merchantId,
    ])
    await client.query(
      `DELETE FROM package_purchase_request WHERE "merchantId" = $1`,
      [merchantId],
    )
    await client.query(
      `DELETE FROM balance_transaction
        WHERE "merchantId" = $1 AND type = 'PAYMENT_CONFIRMED'
          AND "paymentMethod" = 'PACKAGE'`,
      [merchantId],
    )
    await client.query(
      `UPDATE merchant_balance mb
          SET balance = (SELECT coalesce(sum(bt.amount), 0)
                           FROM balance_transaction bt
                          WHERE bt."merchantId" = mb."merchantId"
                            AND bt.status = 'SETTLED')
        WHERE mb."merchantId" = $1`,
      [merchantId],
    )
  })
}

async function skipOnboardingIfNeeded(page: Page) {
  if (page.url().includes("/welcome")) {
    await page.locator(onboarding.skip).click()
    await page.waitForURL(/\/merchant/, { timeout: 15_000 })
    await waitForAppReady(page)
  }
}

async function openAdminPackages(page: Page) {
  await page.goto("/dashboard/packages")
  await waitForAppReady(page)
  await expect(page.locator(packages.table)).toBeVisible()
  await expect(page.locator(packages.requestsTable)).toBeVisible()
}

async function openMerchantPricing(page: Page) {
  // The onboarding guard bounces incomplete merchants to /welcome, whose skip
  // button lands on /merchant — so come back until the catalogue is really up.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/merchant/pricing")
    await waitForAppReady(page)
    if ((await page.locator(packages.catalogueCard(STARTER)).count()) > 0)
      return
    await skipOnboardingIfNeeded(page)
  }
  await expect(page.locator(packages.catalogueCard(STARTER))).toBeVisible()
}

/** Row ids are minted by the API; read them back off the tagged row. */
async function packageIdFor(page: Page, name: string): Promise<string> {
  const row = page.locator(packages.rowPrefix).filter({ hasText: name }).first()
  await expect(row).toBeVisible()
  const testid = await row.getAttribute("data-testid")
  return (testid ?? "").slice(packages.rowIdPrefix.length)
}

/** Locate one merchant's row in the admin review queue by business name. */
async function requestIdFor(page: Page, merchantName: string): Promise<string> {
  const row = page
    .locator(packages.requestRowPrefix)
    .filter({ hasText: merchantName })
    .first()
  await expect(row).toBeVisible()
  const testid = await row.getAttribute("data-testid")
  return (testid ?? "").slice(packages.requestRowIdPrefix.length)
}

// ─── S58. Admin package CRUD ─────────────────────────────────────────────────
test.describe("S58. Admin package catalogue CRUD", () => {
  test("create, tier, edit, toggle and delete a package", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await openAdminPackages(page)

    const name = `E2E Scratch ${Date.now()}`

    await page.locator(packages.createButton).click()
    await page.locator(packages.nameInput).fill(name)
    await page
      .locator(packages.descriptionInput)
      .fill("Created by the S58 e2e flow")
    await page.locator(packages.priceInput).fill("777")
    await page.locator(packages.saveButton).click()
    await expect(page.locator(dialog.formDialog)).toBeHidden()

    const pkgId = await packageIdFor(page, name)

    // A brand-new package is live by default, so it lands in the merchant
    // catalogue straight away. Flip it off and back on to prove the toggle.
    const toggle = page.locator(packages.activeSwitchFor(pkgId))
    await expect(toggle).toBeChecked()
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await toggle.click()
    await expect(toggle).toBeChecked()

    // Add a discount tier.
    await page.locator(packages.actionsButton(pkgId)).click()
    await page.locator(packages.addTierItem(pkgId)).click()
    await expect(page.locator(dialog.formDialog)).toBeVisible()
    await page.locator(packages.tierOrderCountInput).fill("5")
    await page.locator(packages.tierRuleTypeSelect).click()
    await page.locator(packages.tierRuleOption("FLAT")).click()
    await page.locator(packages.tierRuleValueInput).fill("90")
    await page.locator(packages.tierSave).click()
    await expect(page.locator(dialog.formDialog)).toBeHidden()

    const row = page.locator(packages.row(pkgId))
    await expect(row).toContainText("Flat 90")

    // Rename it.
    await page.locator(packages.actionsButton(pkgId)).click()
    await page.locator(packages.editItem(pkgId)).click()
    await page.locator(packages.nameInput).fill(`${name} v2`)
    await page.locator(packages.saveButton).click()
    await expect(page.locator(dialog.formDialog)).toBeHidden()
    await expect(
      page.locator(packages.rowPrefix).filter({ hasText: `${name} v2` }),
    ).toBeVisible()

    // Nobody bought it, so the delete removes it outright.
    await page.locator(packages.actionsButton(pkgId)).click()
    await page.locator(packages.deleteItem(pkgId)).click()
    await expect(page.locator(dialog.confirm)).toBeVisible()
    await page.locator(dialog.confirmButton).click()
    await expect(page.locator(dialog.confirm)).toBeHidden()
    await expect(row).toHaveCount(0)
  })

  test("the seeded packages and request queue are visible", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)
    await openAdminPackages(page)

    await expect(page.locator(packages.row(STARTER))).toBeVisible()
    await expect(page.locator(packages.row(GROWTH))).toBeVisible()
    // Inactive packages stay visible to admins…
    await expect(page.locator(packages.row(ENTERPRISE))).toBeVisible()

    // …and the seeded merchant2 request sits in the pending queue.
    await expect(
      page.locator(packages.requestsTable).getByText(MERCHANT_2_NAME),
    ).toBeVisible()
  })
})

// ─── S59. Purchase request → admin review ────────────────────────────────────
test.describe("S59. Package purchase request and approval", () => {
  test("merchant requests a package, admin approves, bundle activates", async ({
    page,
  }) => {
    // Retry-safe: clear any bundle/request a previous run left behind.
    await resetMerchant3Packages()

    await login(page, MERCHANT_3)
    await openMerchantPricing(page)

    // No bundle yet, and merchants never see an unpublished package.
    await expect(page.locator(packages.activePackage)).toHaveCount(0)
    await expect(page.locator(packages.catalogueCard(STARTER))).toBeVisible()
    await expect(page.locator(packages.catalogueCard(ENTERPRISE))).toHaveCount(
      0,
    )

    await page.locator(packages.requestButton(STARTER)).click()
    await page
      .locator(packages.requestNoteInput)
      .fill("Sent 1000 TK via bKash, trxID E2EFLOW")
    await page.locator(packages.requestSubmit).click()
    await expect(page.locator(packages.pendingRequest)).toBeVisible()

    // A second request is locked out while this one awaits review.
    await expect(page.locator(packages.requestButton(GROWTH))).toBeDisabled()

    await login(page, CREDS.superAdmin)
    await openAdminPackages(page)
    const requestId = await requestIdFor(page, MERCHANT_3_NAME)
    await page.locator(packages.requestApprove(requestId)).click()
    // Approving leaves the PENDING tab, so the row drops out of the queue.
    await expect(page.locator(packages.requestRow(requestId))).toHaveCount(0)

    await login(page, MERCHANT_3)
    await openMerchantPricing(page)
    await expect(page.locator(packages.activePackage)).toBeVisible()
    await expect(page.locator(packages.pendingRequest)).toHaveCount(0)
    await expect(page.locator(packages.ordersUsed)).toHaveText("0")
    // The catalogue stays locked while the bundle is live.
    await expect(page.locator(packages.requestButton(GROWTH))).toBeDisabled()
  })

  test("a rejected request does not lock the merchant out", async ({
    page,
  }) => {
    // merchant2's seeded request gets declined with a reason.
    await login(page, CREDS.superAdmin)
    await openAdminPackages(page)
    const requestId = await requestIdFor(page, MERCHANT_2_NAME)
    await page.locator(packages.requestReject(requestId)).click()
    await page
      .locator(packages.requestRejectReason)
      .fill("Could not verify the bKash transaction")
    await page.locator(packages.requestRejectConfirm).click()
    await expect(page.locator(packages.requestRejectConfirm)).toBeHidden()

    await login(page, MERCHANT_2)
    await openMerchantPricing(page)
    await expect(page.locator(packages.rejectedRequest)).toBeVisible()
    await expect(page.locator(packages.activePackage)).toHaveCount(0)
    // Settled history is not a lock: the merchant may ask again.
    await expect(page.locator(packages.requestButton(GROWTH))).toBeEnabled()

    await page.locator(packages.requestButton(GROWTH)).click()
    await page.locator(packages.requestSubmit).click()
    await expect(page.locator(packages.pendingRequest)).toBeVisible()
  })
})

// ─── S60. Merchant bundle card ───────────────────────────────────────────────
test.describe("S60. Active bundle, quota and tier progress", () => {
  test("a merchant with a live bundle sees quota and next-tier progress", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await openMerchantPricing(page)

    await expect(page.locator(packages.activePackage)).toBeVisible()
    // Seeded at 60; other suites push orders through this merchant, so assert a
    // live count at or above the seed rather than an exact number.
    await expect(page.locator(packages.ordersUsed)).toHaveText(/^\d+$/)
    expect(
      Number(await page.locator(packages.ordersUsed).textContent()),
    ).toBeGreaterThanOrEqual(60)
    await expect(page.locator(packages.progress)).toBeVisible()

    // Every catalogue button reports the bundle as already active.
    await expect(page.locator(packages.requestButton(STARTER))).toBeDisabled()
    await expect(page.locator(packages.requestButton(STARTER))).toHaveText(
      "Bundle already active",
    )
    await expect(page.locator(packages.requestButton(GROWTH))).toBeDisabled()
  })
})
