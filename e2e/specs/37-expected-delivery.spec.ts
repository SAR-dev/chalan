import "dotenv/config"

import { expect, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS, login, toast } from "../helpers"
import { deliveryPromise } from "../selectors"

// ─── 3701. Expected delivery date ─────────────────────────────────────────────

/**
 * A seeded order. Every seeded order carries a promise (the seed snapshots one
 * from the same zone matrix order creation uses), so this does not depend on
 * having created anything first.
 */
const TARGET = "ORD-100001E"

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * The recipient's link, not the printed code.
 *
 * This distinction is the whole reason the first test failed when it used the
 * order code: a code lookup deliberately renders the *minimal* view — no
 * shipment details, no merchant note, no rider contact — and "Expected by" is a
 * shipment detail. Widening what a bare code exposes would be a privacy change
 * nobody asked for, so the spec goes through the token the recipient is
 * actually sent.
 */
async function trackingToken(): Promise<string> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ trackingToken: string | null }>(
      `SELECT "trackingToken" FROM "order" WHERE id = $1`,
      [TARGET],
    )
    const token = rows[0]?.trackingToken
    if (!token) throw new Error(`${TARGET} has no tracking token`)
    return token
  })
}

test.describe("3701. Expected delivery date", () => {
  test("the recipient sees the promised date on their tracking page", async ({
    page,
  }) => {
    // Public, and unauthenticated on purpose: the promise is for the person
    // waiting for the parcel, who has no account here.
    await page.goto(`/track/${await trackingToken()}`)

    const row = page.locator(deliveryPromise.trackExpectedBy)
    await expect(row).toBeVisible({ timeout: 15_000 })
    // A year, not a formatted date: the exact string is locale/timezone
    // dependent, and a date from a different year would mean the promise was
    // computed off the wrong instant.
    await expect(row).toContainText("2026")
  })

  test("an admin override reaches the recipient, and cannot predate the order", async ({
    page,
  }) => {
    await login(page, CREDS.superAdmin)

    // A promise cannot predate the parcel it is about — refused, not stored.
    const refused = await page.request.patch(
      `/api/orders/${TARGET}/set-expected-delivery`,
      { data: { date: "2000-01-01" } },
    )
    expect(refused.status()).toBe(400)

    const accepted = await page.request.patch(
      `/api/orders/${TARGET}/set-expected-delivery`,
      { data: { date: "2030-03-15" } },
    )
    expect(accepted.status()).toBe(200)

    // The recipient sees the date the admin chose.
    await page.goto(`/track/${await trackingToken()}`)
    await expect(page.locator(deliveryPromise.trackExpectedBy)).toContainText(
      "2030",
      { timeout: 15_000 },
    )
  })

  test("the order detail offers the override to an admin", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto(`/dashboard/orders/${TARGET}`)

    const open = page.locator(deliveryPromise.setExpectedDate)
    await expect(open).toBeVisible({ timeout: 15_000 })
    await open.click()

    await page.locator(deliveryPromise.dateInput).fill("2030-04-20")
    await page.locator(deliveryPromise.confirm).click()

    // The toast names both halves of the change rather than just "saved".
    await expect(toast(page, "now expected by 2030-04-20")).toBeVisible({
      timeout: 15_000,
    })

    // And the recipient's page reads back what was written.
    await page.goto(`/track/${await trackingToken()}`)
    await expect(page.locator(deliveryPromise.trackExpectedBy)).toContainText(
      "2030",
      { timeout: 15_000 },
    )
  })
})
