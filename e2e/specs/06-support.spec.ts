import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { support } from "../selectors"

// ─── Support ticket lifecycle ────────────────────────────────────────────────
test.describe("0601. Support tickets", () => {
  test("merchant submits a ticket and super admin replies", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)

    await page.goto("/merchant/support")
    await waitForAppReady(page)
    await expect(page.getByTestId("support-tickets")).toBeVisible()

    const subject = `E2E payout question ${Date.now()}`
    await page.getByTestId("support-new").click()
    await page.getByTestId("support-subject").fill(subject)
    await page
      .getByTestId("support-message")
      .fill("Please help me with my pending payout request.")
    await page.getByTestId("support-submit").click()

    await expect(
      page.getByTestId("support-row").filter({ hasText: subject }),
    ).toBeVisible({ timeout: 15_000 })

    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/support")
    await waitForAppReady(page)

    const adminRow = page
      .locator(support.rowByTableId("support-tickets"))
      .filter({ hasText: subject })
    await expect(adminRow).toBeVisible({ timeout: 15_000 })

    await adminRow.locator(support.rowActions).click()
    await page.getByTestId("support-reply-open").click()
    await page
      .getByTestId("support-reply-input")
      .fill("We have processed your payout.")
    await page.getByTestId("support-reply-submit").click()

    await expect(adminRow.locator(support.status)).toHaveText("Answered", {
      timeout: 15_000,
    })
  })
})
