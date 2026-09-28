import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { help, pricing } from "../selectors"

/** Skip onboarding if the merchant landed on /welcome */
async function skipOnboardingIfNeeded(page: any) {
  if (page.url().includes("/welcome")) {
    await page.getByRole("button", { name: /skip for now/i }).click()
    await page.waitForURL(/\/merchant/, { timeout: 15_000 })
    await waitForAppReady(page)
  }
}

// ─── S1. Full Order Lifecycle ────────────────────────────────────────────────
test.describe("S1. Full Order Lifecycle", () => {
  test("merchant creates order → admin views orders", async ({ page }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)

    await page.goto("/merchant/orders/new")
    await waitForAppReady(page)

    // Select pickup location
    await page.locator("[id^='pickup-']").first().click()
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
    await waitForAppReady(page)

    // Admin views orders
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/orders")
    await waitForAppReady(page)
  })
})

// ─── S6. Merchant Suspend & Reactivate ───────────────────────────────────────
test.describe("S6. Merchant Suspend & Reactivate", () => {
  test("admin views merchant list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/merchants")
    await waitForAppReady(page)
    await expect(page.getByText(/merchants/i).first()).toBeVisible()
  })
})

// ─── S8. Warehouse Operations ────────────────────────────────────────────────
test.describe("S8. Warehouse Operations", () => {
  test("warehouse admin views queues", async ({ page }) => {
    await login(page, CREDS.warehouseAdmin)

    await page.goto("/warehouse")
    await waitForAppReady(page)
    // The page title or heading should be visible
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/warehouse/dispatch")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S10. Payout Lifecycle ───────────────────────────────────────────────────
test.describe("S10. Payout Lifecycle", () => {
  test("admin views payout queue", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/payouts")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S12. Zone Pricing Management ────────────────────────────────────────────
test.describe("S12. Zone Pricing Management", () => {
  test("admin views zones and pricing", async ({ page }) => {
    await login(page, CREDS.superAdmin)

    await page.goto("/dashboard/delivery-zones")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/dashboard/zone-pricing")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/dashboard/delivery-cities")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S16. Rider Dashboard ────────────────────────────────────────────────────
test.describe("S16. Rider Dashboard", () => {
  test("rider sees stats and task sections", async ({ page }) => {
    await login(page, CREDS.rider)
    await waitForAppReady(page)

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
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S18. Rider Delivery Flow ────────────────────────────────────────────────
test.describe("S18. Rider Delivery Flow", () => {
  test("rider views delivery queue", async ({ page }) => {
    await login(page, CREDS.rider)
    await page.goto("/rider/delivery")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── S19. Landing Page ───────────────────────────────────────────────────────
test.describe("S19. Landing Page", () => {
  test("renders hero, features, and calculator", async ({ page }) => {
    await page.goto("/")
    await waitForAppReady(page)

    await expect(page.getByText(/ship anything/i)).toBeVisible()
    await expect(page.getByText(/track everything/i)).toBeVisible()
    await expect(page.getByText("Order Management")).toBeVisible()
    await expect(page.getByText("Delivery Fee Calculator")).toBeVisible()
  })
})

// ─── S55. Public Pricing Page ────────────────────────────────────────────────
test.describe("S55. Public Pricing Rate Card", () => {
  test("landing links to the city-to-city rate card", async ({ page }) => {
    await page.goto("/")
    await waitForAppReady(page)

    await expect(page.locator(pricing.navLink)).toBeVisible()
    await page.locator(pricing.navLink).click()
    await expect(page).toHaveURL(/\/rates$/)
  })

  test("pricing page renders the city-to-city matrix", async ({ page }) => {
    await page.goto("/rates")
    await waitForAppReady(page)

    await expect(page.locator(pricing.pageHeading)).toBeVisible()
    await expect(page.locator(pricing.table)).toBeVisible()
    await expect(page.locator(pricing.cancellationTable)).toBeVisible()
    await expect(
      page.locator(pricing.table).getByText("Pickup ↓ / Destination →"),
    ).toBeVisible()
    // Seeded zones produce many pairs, so at least one base-rate cell exists.
    await expect(
      page.locator(pricing.table).getByText(/TK$/).first(),
    ).toBeVisible()
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
    await waitForAppReady(page)

    await expect(page.getByText("Delivery Fee Calculator")).toBeVisible()
    await page.locator("#calc-weight").fill("2")
    await page.locator("#calc-cod").fill("1000")
    await expect(page.getByText("Delivery fee", { exact: true })).toBeVisible()
    await expect(page.getByText("Merchant receives")).toBeVisible()
  })
})

// ─── S23. FAQ & Help Center ──────────────────────────────────────────────────
test.describe("S25. FAQ & Help Center", () => {
  test("faq page renders", async ({ page }) => {
    await page.goto("/faq")
    await expect(page.getByRole("heading", { name: /faq/i })).toBeVisible()
  })

  test("help center opens a guide", async ({ page }) => {
    await page.goto("/help")
    await expect(
      page.getByRole("heading", { name: /help center/i }),
    ).toBeVisible()

    await page.locator(help.guideLink("merchant")).click()
    await page.waitForURL(/\/help\/merchant/)
    await expect(
      page.getByRole("heading", { name: /merchant guide/i }),
    ).toBeVisible()
  })
})

// ─── S9. Team Management ─────────────────────────────────────────────────────
test.describe("S9. Team Management", () => {
  test("admin views team list", async ({ page }) => {
    await login(page, CREDS.superAdmin)
    await page.goto("/dashboard/team")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Merchant Navigation ─────────────────────────────────────────────────────
test.describe("S26. Merchant Dashboard", () => {
  test("merchant can access all sections", async ({ page }) => {
    await login(page, CREDS.merchant)
    await skipOnboardingIfNeeded(page)

    await page.goto("/merchant/finance")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/merchant/pricing")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()

    await page.goto("/merchant/orders")
    await waitForAppReady(page)
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

// ─── Rider Application ───────────────────────────────────────────────────────
test.describe("S27. Rider Application", () => {
  test("application page has print button", async ({ page }) => {
    await page.goto("/apply/rider")
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible()
  })
})

// ─── Auth Flows ──────────────────────────────────────────────────────────────
test.describe("S28. Auth", () => {
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

  test("server-side logout redirects with next= and returns there after login", async ({
    page,
  }) => {
    await page.context().clearCookies()
    await page.goto("/dashboard/audit-logs")
    await page.waitForURL(/\/login\?next=/, { timeout: 15_000 })
    expect(
      decodeURIComponent(new URL(page.url()).searchParams.get("next")!),
    ).toBe("/dashboard/audit-logs")

    await login(page, CREDS.superAdmin)
    expect(page.url()).toContain("/dashboard/audit-logs")
  })

  test("expired session in-app redirects with next= and returns there after login", async ({
    page,
  }) => {
    await login(page, CREDS.merchant)
    await page.goto("/merchant/finance")
    await waitForAppReady(page)

    await page.context().clearCookies()
    await page.reload()
    await page.waitForURL(/\/login\?next=/, { timeout: 15_000 })
    expect(
      decodeURIComponent(new URL(page.url()).searchParams.get("next")!),
    ).toContain("/merchant/finance")

    await login(page, CREDS.merchant, { waitFor: /\/merchant/ })
    expect(page.url()).toContain("/merchant/finance")
  })
})
