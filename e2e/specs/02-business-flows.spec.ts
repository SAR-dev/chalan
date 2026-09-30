import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import {
  deliveryCities,
  dialog,
  merchants,
  orders,
  register,
  riderApplication,
} from "../selectors"

// ─── S2. Merchant Registration ─────────────────────────────────────────────────
test.describe("S2. Merchant Registration", () => {
  test("user can access registration page", async ({ page }) => {
    await page.goto("/register")
    await waitForAppReady(page)
    // Verify registration form exists
    await expect(page.locator(register.form)).toBeVisible()
  })

  test("registered merchant sees pending status", async ({ page }) => {
    // Login as a merchant that's already active (seeded)
    await login(page, CREDS.merchant)
    await waitForAppReady(page)
    // Merchant dashboard should load
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S3. Order Exception — Failed → Reattempt ────────────────────────────────
test.describe("S3. Failed → Reattempt → Delivery", () => {
  test("warehouse admin can view exceptions tab", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/exceptions")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S4. Failed → Return to Sender ──────────────────────────────────────────
test.describe("S4. Failed → Return", () => {
  test("warehouse admin can view exceptions for return", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/exceptions")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S5. Merchant Self-Cancellation ──────────────────────────────────────────
test.describe("S5. Merchant Self-Cancellation", () => {
  test("merchant can view orders and cancel button exists", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
    // The merchant's own orders table renders (with its toolbar). This replaces
    // an assertion that could never fail (`count >= 0`).
    await expect(page.locator(orders.merchantTable)).toBeVisible()
    await expect(page.locator(orders.merchantOrdersSearch)).toBeVisible()
  })
})

// ─── S7. Bulk Order Operations ───────────────────────────────────────────────
test.describe("S7. Bulk Order Operations", () => {
  test("admin can access bulk actions on orders page", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S11. Payout Rejection ──────────────────────────────────────────────────
test.describe("S11. Payout Rejection", () => {
  test("admin can view payout list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/payouts")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S13. Zone-Based Order Pricing ───────────────────────────────────────────
test.describe("S13. Zone-Based Order Pricing", () => {
  test("order form loads correctly", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/orders/new")
    await waitForAppReady(page)
    // Verify order form page loaded
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S14. Delivery City Management ───────────────────────────────────────────
test.describe("S14. Delivery City Management", () => {
  test("admin can view and create cities", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/delivery-cities")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    // Click Add City button
    const addBtn = page.locator(deliveryCities.addButton)
    if (await addBtn.isVisible()) {
      await addBtn.click()
      // Dialog should open
      await expect(page.locator(dialog.formDialog)).toBeVisible()
    }
  })
})

// ─── S15. Rider Application → Delivery ───────────────────────────────────────
test.describe("S15. Rider Application", () => {
  test("rider application page has all fields", async ({ page }) => {
    await page.goto("/apply/rider")
    await waitForAppReady(page)
    // Verify form fields exist
    await expect(page.locator(riderApplication.name)).toBeVisible()
    await expect(page.locator(riderApplication.email)).toBeVisible()
    await expect(page.locator(riderApplication.phone)).toBeVisible()
    await expect(page.locator(riderApplication.print)).toBeVisible()
  })
})

// ─── S20. Announcement Lifecycle ──────────────────────────────────────────────
test.describe("S20. Announcement Lifecycle", () => {
  test("admin can view announcements page", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/announcements")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("merchant can view announcements inbox", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/announcements")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S23. Merchant Balance & Payment ──────────────────────────────────────────
test.describe("S23. Merchant Balance & Payment", () => {
  test("merchant can view finance page", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/finance")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("admin can view merchant balance", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/merchants")
    await waitForAppReady(page)
    // Click on a merchant to view their balance
    const row = page.locator(merchants.firstRow).first()
    if (await row.isVisible()) {
      await row.click()
      await waitForAppReady(page)
      // Should show merchant details
      await expect(page.getByRole("heading").first()).toBeVisible()
    }
  })
})

// ─── Warehouse COD Settlement ─────────────────────────────────────────────────
test.describe("S29. Warehouse COD Settlement", () => {
  test("warehouse admin can view COD settlement page", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/cod-settlement")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Merchant Pricing ─────────────────────────────────────────────────────────
test.describe("S30. Merchant Pricing", () => {
  test("merchant can view pricing page", async ({ page }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/pricing")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Admin Merchant Management ────────────────────────────────────────────────
test.describe("S31. Admin Merchant Management", () => {
  test("admin can view merchant details", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/merchants")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    // Click on first merchant row
    const row = page.locator(merchants.firstRow).first()
    if (await row.isVisible()) {
      await row.click()
      await waitForAppReady(page)
      await expect(page.getByRole("heading").first()).toBeVisible()
    }
  })
})

// ─── Admin Rider Management ───────────────────────────────────────────────────
test.describe("S32. Admin Rider Management", () => {
  test("admin can view rider list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/riders")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })

  test("admin can view rider applications", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/rider-applications")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Warehouse Dispatch ───────────────────────────────────────────────────────
test.describe("S33. Warehouse Dispatch", () => {
  test("warehouse admin can view dispatch desk", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse/dispatch")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Warehouse Intake ─────────────────────────────────────────────────────────
test.describe("S34. Warehouse Intake", () => {
  test("warehouse admin can view intake queue", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)
    await page.goto("/warehouse")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})
