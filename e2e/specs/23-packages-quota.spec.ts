import "dotenv/config"

import { expect, type Page, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import { dialog, orders, packages } from "../selectors"

/**
 * Bundle quota accounting (S61).
 *
 * Two invariants that only a real batch can prove:
 *
 *  1. A parcel that never really shipped (cancelled) gives its bundle quota
 *     back, so `ordersUsed` returns to where it started.
 *  2. A batch is priced order-by-order against the *cumulative* count, so a
 *     batch that crosses a tier boundary discounts the first rows at the old
 *     tier and the later rows at the new one — the seeded Growth bundle
 *     switches from 30% off at 50 orders to 40% off at 100.
 *
 * Both tests pin `ordersUsed` first, so a retry always starts from the same
 * place no matter what the other 95 tests did to merchant1's bundle.
 */
const PICKUP = "Merchant 1 Pickup — 100 Business Street"
const CITY = "Dhaka"

const HEADER_CELLS = [
  "pickup_location",
  "recipient_name",
  "recipient_phone",
  "delivery_city",
  "delivery_address",
  "parcel_weight_kg",
  "product_cost",
  "delivery_type",
  "delivery_map_link",
  "merchant_note",
]

function csvRow(recipient: string): string[] {
  return [
    PICKUP,
    recipient,
    "01712345678",
    CITY,
    "123 S61 Street Dhaka",
    "1",
    "500",
    "STANDARD",
    "",
    "e2e package quota",
  ]
}

function csvFile(recipients: string[]) {
  const rows = [HEADER_CELLS, ...recipients.map(csvRow)]
  return {
    name: "s61-bulk.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(rows.map((c) => c.join(",")).join("\r\n"), "utf8"),
  }
}

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

/** Pin merchant1's bundle counter so the assertions are exact. */
async function setBundleUsage(ordersUsed: number): Promise<void> {
  await withDb(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE merchant_package SET "ordersUsed" = $1
        WHERE "merchantId" = (SELECT id FROM merchant WHERE email = 'merchant1@email.com')
          AND "isActive" = true`,
      [ordersUsed],
    )
    if (rowCount !== 1) {
      throw new Error(`expected 1 active bundle for merchant1, got ${rowCount}`)
    }
  })
}

async function orderIdFor(recipient: string): Promise<string> {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM "order" WHERE "recipientName" = $1
        ORDER BY "createdAt" DESC LIMIT 1`,
      [recipient],
    )
    if (!rows[0]) throw new Error(`no order found for ${recipient}`)
    return rows[0].id as string
  })
}

type PricedRow = {
  recipientName: string
  packageRuleType: string | null
  packageRuleValue: number | null
  deliveryFee: string
  merchantPackageId: string | null
}

async function pricedOrders(recipients: string[]): Promise<PricedRow[]> {
  return withDb(async (client) => {
    const { rows } = await client.query<PricedRow>(
      `SELECT "recipientName", "packageRuleType", "packageRuleValue",
              "deliveryFee", "merchantPackageId"
         FROM "order" WHERE "recipientName" = ANY($1)`,
      [recipients],
    )
    return rows
  })
}

/** Import a batch through the merchant's own CSV bulk-create surface. */
async function importOrders(page: Page, recipients: string[]): Promise<void> {
  await page.goto("/merchant/orders")
  await waitForAppReady(page)
  await page.locator(orders.bulkImportOpen).click()
  await page.waitForURL("**/merchant/orders/import")
  await expect(page.locator(orders.bulkImportTemplate)).toBeVisible()

  await page.locator(orders.bulkImportFile).setInputFiles(csvFile(recipients))
  await expect(page.locator(orders.bulkImportSummary)).toHaveText(
    `${recipients.length} valid · 0 errors`,
  )
  await page.locator(orders.bulkImportConfirm).click()
  const count = recipients.length
  // Matches the client's own pluralisation: "1 order created".
  await expect(
    toast(page, `${count} order${count === 1 ? "" : "s"} created`),
  ).toBeVisible({ timeout: 15_000 })
  await page.waitForURL("**/merchant/orders")
}

/** Read the live quota off the merchant's bundle card. */
async function bundleUsageOnPage(page: Page): Promise<number> {
  await page.goto("/merchant/pricing")
  await waitForAppReady(page)
  const counter = page.locator(packages.ordersUsed)
  await expect(counter).toBeVisible()
  return Number(await counter.textContent())
}

// ─── S61. Quota refunds and tier-boundary pricing ────────────────────────────
test.describe("S61. Bundle quota refunds and tier boundaries", () => {
  test("cancelling an order gives its bundle quota back", async ({ page }) => {
    await setBundleUsage(60)
    await login(page, CREDS.merchant)

    const recipient = `E2E Quota Cancel ${Date.now()}`
    await importOrders(page, [recipient])

    // The new parcel consumed one unit of the bundle.
    expect(await bundleUsageOnPage(page)).toBe(61)

    const orderId = await orderIdFor(recipient)
    const [row] = await pricedOrders([recipient])
    // It really was billed against the bundle, so the refund has a target.
    expect(row.merchantPackageId).not.toBeNull()

    await page.goto(`/merchant/orders/${orderId}`)
    await waitForAppReady(page)
    await page.locator(orders.cancelOrderButton).click()
    await expect(page.locator(dialog.formDialog)).toBeVisible()
    await page
      .locator(orders.cancelReasonInput)
      .fill("S61: parcel never shipped")
    await page.locator(orders.cancelOrderSubmit).click()
    await expect(toast(page, `${orderId} has been cancelled.`)).toBeVisible({
      timeout: 15_000,
    })

    // A cancelled parcel never went out, so the quota comes back.
    expect(await bundleUsageOnPage(page)).toBe(60)
  })

  test("a batch crossing a tier boundary prices each order at its own tier", async ({
    page,
  }) => {
    // 98 used: the 50-order tier (30% off) is live, and the 100-order tier
    // (40% off) unlocks two orders into this batch.
    await setBundleUsage(98)
    await login(page, CREDS.merchant)

    const stamp = Date.now()
    const recipients = [0, 1, 2, 3].map(
      (i) => `E2E Tier Boundary ${i} ${stamp}`,
    )
    await importOrders(page, recipients)

    // The whole batch consumed quota, boundary or not.
    expect(await bundleUsageOnPage(page)).toBe(102)

    const rows = await pricedOrders(recipients)
    expect(rows).toHaveLength(4)
    const byName = new Map(rows.map((r) => [r.recipientName, r]))
    const ruleValues = recipients.map(
      (name) => byName.get(name)?.packageRuleValue,
    )
    // Cumulative pricing: rows 0-1 land before the 100th order, rows 2-3 after.
    expect(ruleValues).toEqual([30, 30, 40, 40])
    for (const name of recipients) {
      expect(byName.get(name)?.packageRuleType).toBe("PERCENT_OFF")
    }

    // …and the deeper discount really reached the money, not just a label.
    const fees = recipients.map((name) => Number(byName.get(name)?.deliveryFee))
    expect(fees[0]).toBe(fees[1])
    expect(fees[2]).toBe(fees[3])
    expect(fees[2]).toBeLessThan(fees[0])
  })
})
