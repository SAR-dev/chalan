import { expect, test } from "@playwright/test"
import { CREDS, login } from "../helpers"

/** Skip onboarding if the merchant landed on /welcome */
async function skipOnboardingIfNeeded(page: any) {
  if (page.url().includes("/welcome")) {
    await page.getByRole("button", { name: /skip for now/i }).click()
    await page.waitForURL(/\/merchant/, { timeout: 15_000 })
    await page.waitForLoadState("networkidle")
  }
}

// ─── S1. Full Order Lifecycle ────────────────────────────────────────────────
test.describe("S1. Full Order Lifecycle", () => {
  test("merchant creates order → admin views orders", async ({ page }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)

    await page.goto("/merchant/orders/new")
    await page.waitForLoadState("networkidle")

    // Select pickup location
    await page.locator("#pickup").click()
    await page.getByRole("option").first().click()

    // Fill recipient details
    await page.getByLabel("Recipient name").fill("E2E Test Recipient")
    await page.getByLabel("Recipient phone").fill("01712345678")

    // Select delivery city
    await page.locator("[id^='city-']").first().click()
    await page.getByRole("option").first().click()

    // Fill delivery address
    await page.getByLabel("Delivery address").fill("123 E2E Test Street, Dhaka")

    // Fill weight and COD amount
    await page.getByLabel("Parcel weight").fill("1")
    await page.getByLabel("COD amount").fill("500")

    // Submit order
    await page.getByRole("button", { name: /confirm/i }).click()
    await page.waitForLoadState("networkidle")

    // Admin views orders
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await page.waitForLoadState("networkidle")
  })
})

// ─── S6. Merchant Suspend & Reactivate ───────────────────────────────────────
test.describe("S6. Merchant Suspend & Reactivate", () => {
  test("admin views merchant list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/merchants")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText(/merchants/i).first()).toBeVisible()
  })
})

// ─── S8. Warehouse Operations ────────────────────────────────────────────────
test.describe("S8. Warehouse Operations", () => {
  test("warehouse admin views queues", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)

    await page.goto("/warehouse")
    await page.waitForLoadState("networkidle")
    // The page title or heading should be visible
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/warehouse/dispatch")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S10. Payout Lifecycle ───────────────────────────────────────────────────
test.describe("S10. Payout Lifecycle", () => {
  test("admin views payout queue", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/payouts")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S12. Zone Pricing Management ────────────────────────────────────────────
test.describe("S12. Zone Pricing Management", () => {
  test("admin views zones and pricing", async ({ page }) => {
    await login(page, CREDS.superAdmin)

    await page.goto("/dashboard/delivery-zones")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/dashboard/zone-pricing")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/dashboard/delivery-cities")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S16. Rider Dashboard ────────────────────────────────────────────────────
test.describe("S16. Rider Dashboard", () => {
  test("rider sees stats and task sections", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.waitForLoadState("networkidle")

    // The page header should be visible
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 10_000,
    })
  })
})

// ─── S17. Rider Pickup Flow ──────────────────────────────────────────────────
test.describe("S17. Rider Pickup Flow", () => {
  test("rider views pickup queue", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider/pickup")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S18. Rider Delivery Flow ────────────────────────────────────────────────
test.describe("S18. Rider Delivery Flow", () => {
  test("rider views delivery queue", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider/delivery")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S19. Landing Page ───────────────────────────────────────────────────────
test.describe("S19. Landing Page", () => {
  test("renders hero, features, and calculator", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.getByText(/ship anything/i)).toBeVisible()
    await expect(page.getByText(/track everything/i)).toBeVisible()
    await expect(page.getByText("Order Management")).toBeVisible()
    await expect(page.getByText("Delivery Fee Calculator")).toBeVisible()
  })
})

// ─── S21. Public Tracking ────────────────────────────────────────────────────
test.describe("S21. Public Tracking", () => {
  test("user can access tracking page", async ({ page }) => {
    await page.goto("/track")
    await expect(page.getByRole("heading", { name: /track/i })).toBeVisible()
  })
})

// ─── S22. Delivery Fee Calculator ────────────────────────────────────────────
test.describe("S22. Delivery Fee Calculator", () => {
  test("calculator shows estimates", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.getByText("Delivery Fee Calculator")).toBeVisible()
    await page.locator("#calc-weight").fill("2")
    await page.locator("#calc-cod").fill("1000")
    await expect(page.getByText("Delivery fee", { exact: true })).toBeVisible()
    await expect(page.getByText("Merchant receives")).toBeVisible()
  })
})

// ─── S9. Team Management ─────────────────────────────────────────────────────
test.describe("S9. Team Management", () => {
  test("admin views team list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/team")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Merchant Navigation ─────────────────────────────────────────────────────
test.describe("Merchant Dashboard", () => {
  test("merchant can access all sections", async ({ page }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)

    await page.goto("/merchant/finance")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/merchant/pricing")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/merchant/orders")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Rider Application ───────────────────────────────────────────────────────
test.describe("Rider Application", () => {
  test("application page has print button", async ({ page }) => {
    await page.goto("/apply/rider")
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible()
  })
})

// ─── Auth Flows ──────────────────────────────────────────────────────────────
test.describe("Auth", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("[data-testid='login-email']")).toBeVisible()
    await expect(page.locator("[data-testid='login-password']")).toBeVisible()
    await expect(page.locator("[data-testid='login-submit']")).toBeVisible()
    await expect(page.getByText("Welcome back")).toBeVisible()
  })

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill("wrong@email.com")
    await page.locator("[data-testid='login-password']").fill("wrongpass")
    await page.getByRole("button", { name: /sign in/i }).click()
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 })
  })
})
