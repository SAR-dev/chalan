import "dotenv/config"

import { expect, request as pwRequest, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { orders } from "../selectors"

const BASE_URL = "http://localhost:3000"

/**
 * Seed facts these tests depend on (see `seed-content/orders.ts`):
 * the first eight orders are `PENDING`, ids run `ORD-100001E` upward, and
 * `itemType` is null whenever `i % 3 === 0`. So the first two pending orders
 * are one with contents and one without — exactly the pair worth testing.
 */
const WITH_CONTENTS = { id: "ORD-100002E", itemType: "Phone charger" }
const WITHOUT_CONTENTS = { id: "ORD-100001E" }

async function loginContext(cred: { email: string; password: string }) {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL })
  const res = await ctx.post("/api/auth/sign-in/email", {
    data: { email: cred.email, password: cred.password },
  })
  expect(res.ok(), `sign-in ${cred.email} -> ${res.status()}`).toBeTruthy()
  return ctx
}

/** Opens the approve confirmation for one order, narrowed by a search. */
async function openApproveDialog(
  page: import("@playwright/test").Page,
  orderId: string,
) {
  await login(page, CREDS.superAdmin)
  await page.goto("/dashboard/orders")
  await waitForAppReady(page)

  // The list is server-paginated, so the order is not guaranteed to be on the
  // first page — search pins it rather than relying on sort order.
  await page.locator(orders.searchInput).fill(orderId)
  await page.locator(orders.actionsButton(orderId)).click()
  await page.locator(orders.reviewOrder(orderId)).click()
}

// ─── 3101. Admin approves an order ────────────────────────────────────────────
// The confirmation an *admin* sees — the surface item 4.2 of the requirements
// adds the item type to. Approve now also accepts the warehouse hub (3501);
// the role split lives in the approve transition, not in this dialog.
test.describe("3101. Admin approves an order", () => {
  test("the confirmation shows what is in the parcel", async ({ page }) => {
    await openApproveDialog(page, WITH_CONTENTS.id)

    // The point of the row: the approver confirms against the contents, not
    // only a weight and a price.
    await expect(page.locator(orders.approveItemType)).toHaveText(
      WITH_CONTENTS.itemType,
    )
    await expect(page.getByText("Parcel weight")).toBeVisible()
  })

  test("the row is absent, not blank, when nothing was stated", async ({
    page,
  }) => {
    await openApproveDialog(page, WITHOUT_CONTENTS.id)

    // Rendered as an absent row: a permanently empty "Contents" on every legacy
    // order trains approvers to skip the one that carries a value.
    await expect(page.locator(orders.approveItemType)).toHaveCount(0)
    // The confirmation itself still renders — no contents is not an error.
    await expect(page.getByText("Parcel weight")).toBeVisible()
  })

  test("confirming approves the order", async ({ page }) => {
    await openApproveDialog(page, WITH_CONTENTS.id)
    await expect(page.locator(orders.approveItemType)).toBeVisible()

    // Wait on the response rather than a load heuristic: the redirect-free
    // dialog update can settle before the PATCH has been sent, and reading the
    // record then reports PENDING for a decision still in flight.
    const approving = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/orders/${WITH_CONTENTS.id}/approve`) &&
        r.request().method() === "PATCH",
      { timeout: 20_000 },
    )
    await page.locator(orders.approveButton).click()
    const res = await approving
    expect(res.ok(), `approve -> ${res.status()}`).toBeTruthy()

    const admin = await loginContext(CREDS.superAdmin)
    const after = await admin.get(`/api/orders/${WITH_CONTENTS.id}`)
    expect(after.ok(), `order read -> ${after.status()}`).toBeTruthy()
    const order = (await after.json()) as { status?: string }
    expect(order.status).toBe("APPROVED")
    await admin.dispose()
  })
})
