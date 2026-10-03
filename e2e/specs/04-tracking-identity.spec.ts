import "dotenv/config"

import { expect, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS, login, waitForAppReady } from "../helpers"
import { identity, tracking } from "../selectors"

// ─── S56. Merchant sidebar identity ──────────────────────────
test.describe("S56. Merchant sidebar identity", () => {
  test("the merchant sidebar shows the business name, not a logo", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)

    const brand = page.locator(identity.sidebarBrand)
    await expect(brand).toContainText("Merchant 1 Business")
    await expect(brand.locator("img")).toHaveCount(0)
  })
})

// ─── S43. Public tracking token ──────────────────────────────────────
test.describe("S43. Public tracking token", () => {
  /**
   * Pick any seeded order that is still actionable (the receiver note is
   * rejected once an order is DELIVERED / RETURNED / CANCELLED) and read its
   * high-entropy tracking token straight from Postgres.
   */
  async function actionableOrder(): Promise<{ id: string; token: string }> {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set — .env failed to load")
    }
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const res = await client.query(
        `SELECT id, "trackingToken" FROM "order"
         WHERE status NOT IN ('DELIVERED','RETURNED','CANCELLED')
           AND "trackingToken" IS NOT NULL
         ORDER BY id LIMIT 1`,
      )
      const row = res.rows[0] as
        | { id: string; trackingToken: string }
        | undefined
      if (!row) throw new Error("No actionable seeded order found")
      return { id: row.id, token: row.trackingToken }
    } finally {
      await client.end()
    }
  }

  test("the tracking link uses the token; the bare order code is read-only", async ({
    page,
  }) => {
    const { id, token } = await actionableOrder()

    // Token link: full page + an enabled receiver-note form.
    await page.goto(`/track/${token}`)
    await waitForAppReady(page)
    await expect(page.locator(identity.trackBrand)).toContainText(
      "Fulfilled by",
    )
    await expect(page.locator(tracking.noteInput)).toBeVisible()

    // Human order code (parcel label / typed search): readable, but the write
    // affordance is withheld.
    await page.goto(`/track/${id}`)
    await waitForAppReady(page)
    await expect(page.locator(tracking.noteLocked)).toBeVisible()
    await expect(page.locator(tracking.noteInput)).toHaveCount(0)
  })

  test("the receiver note write requires the token and leaks no PII", async ({
    request,
  }) => {
    const { id, token } = await actionableOrder()
    const url = `/api/orders/${id}/receiver-note`

    // A missing token fails validation (400); a wrong token is indistinguishable
    // from an unknown order (404). Neither reveals order data.
    const missing = await request.patch(url, {
      data: { receiverNote: "e2e token note" },
    })
    expect(missing.status()).toBe(400)

    const wrong = await request.patch(url, {
      data: { receiverNote: "e2e token note", token: "b".repeat(32) },
    })
    expect(wrong.status()).toBe(404)

    // Correct token → 200 with a minimal body (no order PII).
    const ok = await request.patch(url, {
      data: { receiverNote: "e2e token note", token },
    })
    expect(ok.status()).toBe(200)
    const body = await ok.json()
    expect(body).toEqual({ ok: true })
    expect(body).not.toHaveProperty("recipientName")
    expect(body).not.toHaveProperty("recipientPhone")
    expect(body).not.toHaveProperty("deliveryAddress")
  })
})
