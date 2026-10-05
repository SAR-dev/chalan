import "dotenv/config"

import { expect, request as pwRequest, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { orders } from "../selectors"

const BASE_URL = "http://localhost:3000"

/**
 * Seed facts these depend on (`seed-content/orders.ts`,
 * `seed-content/users.ts`): every seeded order belongs to WH-100001E (Dhaka
 * Central Hub), which `warehouse.admin1` manages; the first eight orders are
 * PENDING and `itemType` is null whenever `i % 3 === 0` — so ORD-100003E is a
 * pending order that states its contents. S70 only *confirms* ORD-100002E,
 * leaving 100003E awaiting approval for whoever runs first.
 */

const TARGET = "ORD-100003E"

async function loginContext(cred: { email: string; password: string }) {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL })
  const res = await ctx.post("/api/auth/sign-in/email", {
    data: { email: cred.email, password: cred.password },
  })
  expect(res.ok(), `sign-in ${cred.email} -> ${res.status()}`).toBeTruthy()
  return ctx
}

// ─── S77. Warehouse approves an order ────────────────────────────────────────
// Approve used to be SUPER_ADMIN-only; the warehouse hub now approves the
// orders it physically handles, with an ownership guard keeping it to its own
// hub (that guard is unit-pinned in transitions.spec.ts — here we prove the
// happy path end to end through the UI).
test.describe("S77. Warehouse approves an order", () => {
  test("the warehouse admin approves a pending order in their own hub", async ({
    page,
  }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/orders")
    await waitForAppReady(page)

    // Server-paginated, so search pins the row rather than trusting sort order.
    await page.locator(orders.warehouseOrdersSearch).fill(TARGET)
    await page.locator(orders.actionsButton(TARGET)).click()
    await page.locator(orders.reviewOrder(TARGET)).click()

    // Same confirmation as the admin's — the approver confirms against the
    // parcel's contents, weight and price.
    await expect(page.locator(orders.approveItemType)).toBeVisible()
    await expect(page.getByText("Parcel weight")).toBeVisible()

    const approving = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/orders/${TARGET}/approve`) &&
        r.request().method() === "PATCH",
      { timeout: 20_000 },
    )
    await page.locator(orders.approveButton).click()
    const res = await approving
    expect(res.ok(), `approve -> ${res.status()}`).toBeTruthy()

    // Read it back through the API with the warehouse admin's own session —
    // GET /api/orders/:id applies the same warehouse scope as the list, so
    // this doubles as proof the approved order is visible to its hub.
    const ctx = await loginContext(CREDS.warehouseAdmin)
    const after = await ctx.get(`/api/orders/${TARGET}`)
    expect(after.ok(), `order read -> ${after.status()}`).toBeTruthy()
    const order = (await after.json()) as { status?: string }
    expect(order.status).toBe("APPROVED")
    await ctx.dispose()
  })
})
