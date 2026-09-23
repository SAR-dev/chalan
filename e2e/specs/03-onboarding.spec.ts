import { expect, test } from "@playwright/test"

// ─── Onboarding Flow ─────────────────────────────────────────────────────────
test.describe("Merchant Onboarding Flow", () => {
  test("merchant API includes onboardingCompletedAt in self-fetch", async ({
    request,
  }) => {
    // Login via API
    const loginRes = await request.post("/api/auth/sign-in/email", {
      data: {
        email: "merchant1@app.com",
        password: "merchant123",
        callbackURL: "/merchant",
      },
    })
    expect(loginRes.ok()).toBeTruthy()

    // Get merchant ID from /api/users/me
    const meRes = await request.get("/api/users/me")
    expect(meRes.ok()).toBeTruthy()
    const me = await meRes.json()
    expect(me.merchantId).toBeTruthy()

    // Fetch merchant by ID (what useMerchants calls for currentMerchant)
    const merchantRes = await request.get(`/api/merchants/${me.merchantId}`)
    expect(merchantRes.ok()).toBeTruthy()
    const data = await merchantRes.json()

    // onboardingCompletedAt must be present in the response
    expect(data).toHaveProperty("onboardingCompletedAt")
    // For merchant1, it should be null (not set in seed)
    expect(data.onboardingCompletedAt).toBeNull()
  })

  test("merchant without onboarding lands on /merchant then guard redirects to /welcome", async ({
    page,
  }) => {
    // Login via UI
    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill("merchant1@app.com")
    await page
      .locator("[data-testid='login-password']")
      .fill("merchant123")
    await page.locator("[data-testid='login-password']").press("Enter")

    // After login, shell loads merchant data via SWR, guard fires
    // Wait for the guard to redirect to /welcome
    await page.waitForURL(/\/welcome/, { timeout: 15_000 })
    await expect(page.getByText(/welcome/i).first()).toBeVisible()
  })

  test("skip onboarding completes and stays on /merchant without loop", async ({
    page,
  }) => {
    // Login
    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill("merchant1@app.com")
    await page
      .locator("[data-testid='login-password']")
      .fill("merchant123")
    await page.locator("[data-testid='login-password']").press("Enter")

    // Wait for redirect to /welcome
    await page.waitForURL(/\/welcome/, { timeout: 15_000 })
    await expect(page.getByText(/welcome/i).first()).toBeVisible()

    // Click "Skip for now" — calls PATCH /api/merchants/me/onboarding
    await page.getByRole("button", { name: /skip for now/i }).click()

    // Should navigate to /merchant
    await page.waitForURL(/\/merchant/, { timeout: 15_000 })
    await page.waitForLoadState("networkidle")

    // Stay on /merchant for 3 seconds — no redirect loop
    await page.waitForTimeout(3000)
    expect(page.url()).toMatch(/\/merchant$/)
  })

  test("merchant with completed onboarding goes directly to /merchant", async ({
    page,
  }) => {
    // demo@kikuya.com has onboardingCompletedAt set in seed
    await page.goto("/login")
    await page.locator("[data-testid='login-email']").fill("demo@kikuya.com")
    await page.locator("[data-testid='login-password']").fill("demo123")
    await page.locator("[data-testid='login-password']").press("Enter")

    // Should go directly to /merchant (no /welcome redirect)
    await page.waitForURL(/\/merchant/, { timeout: 15_000 })
    await page.waitForLoadState("networkidle")

    // Stay on /merchant
    await page.waitForTimeout(3000)
    expect(page.url()).toMatch(/\/merchant/)
  })
})
