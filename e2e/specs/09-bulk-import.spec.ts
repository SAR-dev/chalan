import { expect, test } from "@playwright/test"
import { CREDS, login, toast, waitForAppReady } from "../helpers"
import { onboarding, orders } from "../selectors"

/** Skip onboarding if the merchant landed on /welcome */
async function skipOnboardingIfNeeded(page: any) {
  if (page.url().includes("/welcome")) {
    await page.locator(onboarding.skip).click()
    await page.waitForURL(/\/merchant/, { timeout: 15_000 })
    await waitForAppReady(page)
  }
}

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

function orderRow(
  name: string,
  overrides: Record<number, string> = {},
): string[] {
  const cells = [
    PICKUP,
    name,
    "01712345678",
    CITY,
    "123 E2E Street Dhaka",
    "1",
    "500",
    "STANDARD",
    "",
    "e2e bulk import",
  ]
  return cells.map((cell, index) => overrides[index] ?? cell)
}

function delimited(
  rows: string[][],
  delimiter: string,
  newline: string,
): string {
  return [HEADER_CELLS, ...rows]
    .map((cells) => cells.join(delimiter))
    .join(newline)
}

function csvFile(
  name: string,
  rows: string[][],
): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(delimited(rows, ",", "\r\n"), "utf8"),
  }
}

async function openImportPage(page: any) {
  await page.locator(orders.bulkImportOpen).click()
  await page.waitForURL("**/merchant/orders/import")
  await expect(page.locator(orders.bulkImportTemplate)).toBeVisible()
}

async function openOrdersPage(page: any) {
  await page.goto("/merchant/orders")
  await waitForAppReady(page)
}

// ─── S40. CSV bulk import ────────────────────────────────────────────────────
test.describe("S40. CSV bulk import", () => {
  test("merchant uploads a CSV, fixes the errors, and imports", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)
    await openOrdersPage(page)
    await openImportPage(page)

    const stamp = Date.now()
    const recipientA = `E2E Import A ${stamp}`
    const recipientB = `E2E Import B ${stamp}`

    // 1 valid row + 1 row with an invalid phone
    await page
      .locator(orders.bulkImportFile)
      .setInputFiles(
        csvFile("bulk-import-invalid.csv", [
          orderRow(recipientA),
          orderRow(recipientB, { 2: "12345" }),
        ]),
      )
    await expect(page.locator(orders.bulkImportSummary)).toHaveText(
      "1 valid · 1 error",
    )
    await expect(page.locator(orders.bulkImportRow(3))).toBeVisible()
    await expect(page.locator(orders.bulkImportConfirm)).toBeDisabled()

    // Re-upload a corrected file
    await page
      .locator(orders.bulkImportFile)
      .setInputFiles(
        csvFile("bulk-import-fixed.csv", [
          orderRow(recipientA),
          orderRow(recipientB, { 2: "01712345679" }),
        ]),
      )
    await expect(page.locator(orders.bulkImportSummary)).toHaveText(
      "2 valid · 0 errors",
    )
    await expect(page.locator(orders.bulkImportConfirm)).toBeEnabled()

    await page.locator(orders.bulkImportConfirm).click()
    await expect(toast(page, "2 orders created")).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForURL("**/merchant/orders")
    await expect(page.locator(orders.bulkImportConfirm)).toBeHidden()

    // The list is server-sorted and paginated, so search for the new rows.
    await page.locator(orders.merchantOrdersSearch).fill("E2E Import")
    const table = page.locator(orders.merchantTable)
    await expect(table.getByText(recipientA).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(table.getByText(recipientB).first()).toBeVisible()
  })

  test("errors block the import and the error CSV downloads", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)
    await openOrdersPage(page)
    await openImportPage(page)

    const stamp = Date.now()
    const recipient = `E2E Blocked ${stamp}`
    // Missing city + non-numeric weight on row 3
    await page
      .locator(orders.bulkImportFile)
      .setInputFiles(
        csvFile("bulk-import-blocked.csv", [
          orderRow(recipient),
          orderRow(`E2E Blocked B ${stamp}`, { 3: "", 5: "heavy" }),
        ]),
      )

    await expect(page.locator(orders.bulkImportSummary)).toHaveText(
      "1 valid · 1 error",
    )
    await expect(page.locator(orders.bulkImportConfirm)).toBeDisabled()
    await expect(page.locator(orders.bulkImportErrorExport)).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.locator(orders.bulkImportErrorExport).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain(".csv")
  })

  test("merchant fixes an invalid row inline in the editable preview", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)
    await openOrdersPage(page)
    await openImportPage(page)

    const stamp = Date.now()
    const recipientA = `E2E Inline A ${stamp}`
    const recipientB = `E2E Inline B ${stamp}`

    await page
      .locator(orders.bulkImportFile)
      .setInputFiles(
        csvFile("bulk-import-inline.csv", [
          orderRow(recipientA),
          orderRow(recipientB, { 2: "12345" }),
        ]),
      )
    await expect(page.locator(orders.bulkImportSummary)).toHaveText(
      "1 valid · 1 error",
    )
    await expect(page.locator(orders.bulkImportConfirm)).toBeDisabled()

    // Errors-only filter narrows the preview to the offending row, All restores it
    await page.locator(orders.bulkImportFilterErrors).click()
    await expect(page.locator(orders.bulkImportRow(3))).toBeVisible()
    await expect(page.locator(orders.bulkImportRow(2))).toBeHidden()
    await page.locator(orders.bulkImportFilterAll).click()
    await expect(page.locator(orders.bulkImportRow(2))).toBeVisible()
    await expect(page.locator(orders.bulkImportRow(3))).toBeVisible()

    // The preview renders the order-create parcel cards, so the phone number
    // is a real input (`phone-{row-{line}}`) that re-resolves the row as you
    // type — no commit step.
    await page.locator("#phone-row-3").fill("01712345679")

    await expect(page.locator(orders.bulkImportRow(3))).toBeVisible()
    await expect(page.locator("#phone-row-3")).toHaveValue("01712345679")
    await expect(page.locator(orders.bulkImportSummary)).toHaveText(
      "2 valid · 0 errors",
    )
    await expect(page.locator(orders.bulkImportConfirm)).toBeEnabled()
  })
})
