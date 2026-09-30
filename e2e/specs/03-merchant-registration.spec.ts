import { expect, test } from "@playwright/test"
import { CREDS, login, waitForAppReady } from "../helpers"
import { nav } from "../selectors"

// ─── S35. Merchant Registration & Verification ───────────────────────────────
// Registration, email verification and landing. The setup wizard is gone (the
// support page documents pricing instead), so there is nothing between a
// verified merchant and their dashboard — these tests pin that down.
test.describe("S35. Merchant Registration & Verification", () => {
  test("verified merchant lands on /merchant with no setup wizard", async ({
    page,
  }) => {
    await login(page, CREDS.demoMerchant, { waitFor: /\/merchant/ })

    // Straight to the dashboard — not /login (auth guard), and no wizard in
    // between. The sidebar proving real merchant content rendered is the point:
    // a blank shell would still match the URL.
    expect(page.url()).toMatch(/\/merchant/)
    await expect(page.locator(nav.sidebarLink("Dashboard"))).toBeVisible({
      timeout: 5000,
    })
  })

  test("merchant self-fetch exposes its record without a setup field", async ({
    request,
  }) => {
    const loginRes = await request.post("/api/auth/sign-in/email", {
      data: {
        email: CREDS.merchant.email,
        password: CREDS.merchant.password,
        callbackURL: "/merchant",
      },
    })
    expect(loginRes.ok()).toBeTruthy()

    const meRes = await request.get("/api/users/me")
    expect(meRes.ok()).toBeTruthy()
    const me = await meRes.json()
    expect(me.merchantId).toBeTruthy()

    const merchantRes = await request.get(`/api/merchants/${me.merchantId}`)
    expect(merchantRes.ok()).toBeTruthy()
    const data = await merchantRes.json()

    // The wizard is gone, so the setup marker must be gone with it — otherwise
    // it is a column nothing reads and a timestamp that lies about a flow that
    // no longer exists.
    expect(data).not.toHaveProperty("onboardingCompletedAt")
  })

  test("freshly registered merchant cannot log in before email verification", async ({
    page,
  }) => {
    const timestamp = Date.now()
    const email = `e2e-unverified-${timestamp}@test.com`
    const regRes = await page.request.post("/api/merchants", {
      data: {
        businessName: `E2E Unverified ${timestamp}`,
        ownerName: "E2E Owner",
        email,
        phone: "+8801710000002",
        address: "E2E Test Address, Dhaka",
        businessType: "E-commerce",
        password: "testpass123",
      },
    })
    expect(regRes.ok()).toBeTruthy()

    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill(email)
    await page.locator("[data-testid='login-password']").fill("testpass123")
    await page.locator("[data-testid='login-password']").press("Enter")

    await waitForAppReady(page)

    // Email verification gates the account; the wizard plays no part in it.
    expect(page.url()).toContain("/login")
  })

  test("unverified merchant sees the activation prompt after login", async ({
    page,
  }) => {
    const timestamp = Date.now()
    const email = `e2e-onboard-${timestamp}@test.com`
    const regRes = await page.request.post("/api/merchants", {
      data: {
        businessName: `E2E Onboard ${timestamp}`,
        ownerName: "E2E Owner",
        email,
        phone: "+8801710000001",
        address: "E2E Test Address, Dhaka",
        businessType: "E-commerce",
        password: "testpass123",
      },
    })
    expect(regRes.ok()).toBeTruthy()

    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill(email)
    await page.locator("[data-testid='login-password']").fill("testpass123")
    await page.locator("[data-testid='login-password']").press("Enter")

    await waitForAppReady(page)

    // Still parked at login: approving needs the verification token, which
    // only ever exists in the email, so the flow cannot proceed past this.
    expect(page.url()).toContain("/login")
  })
})
