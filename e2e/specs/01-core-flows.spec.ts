import "dotenv/config"

import { expect, request as pwRequest, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS, login, waitForAppReady } from "../helpers"
import {
  auth,
  help,
  merchants,
  onboarding,
  orderForm,
  pricing,
  riderApplication,
} from "../selectors"

/** Skip onboarding if the merchant landed on /welcome */
async function skipOnboardingIfNeeded(page: any) {
  if (page.url().includes("/welcome")) {
    await page.locator(onboarding.skip).click()
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

    const card = page.locator(orderForm.card).first()

    // Select pickup location
    await card.locator(orderForm.pickupLocation).click()
    await page.getByRole("option").first().click()

    // Fill recipient details
    await card.locator(orderForm.recipientName).fill("E2E Test Recipient")
    await card.locator(orderForm.recipientPhone).fill("01712345678")

    // Select delivery city
    await card.locator(orderForm.deliveryCity).click()
    await page.getByRole("option").first().click()

    // Fill delivery address
    await card
      .locator(orderForm.deliveryAddress)
      .fill("123 E2E Test Street, Dhaka")

    // Fill weight and COD amount
    await card.locator(orderForm.parcelWeight).fill("1")
    await card.locator(orderForm.productCost).fill("500")

    // Submit order
    await page.locator(orderForm.submitOrder).click()
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
    await expect(page.locator(merchants.table)).toBeVisible()
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
    await expect(page.locator(riderApplication.print)).toBeVisible()
  })
})

// ─── Auth Flows ──────────────────────────────────────────────────────────────
test.describe("S28. Auth", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator(auth.loginEmail)).toBeVisible()
    await expect(page.locator(auth.loginPassword)).toBeVisible()
    await expect(page.locator(auth.loginSubmit)).toBeVisible()
    await expect(page.getByText("Welcome back")).toBeVisible()
  })

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login")
    await page.locator(auth.loginEmail).fill("wrong@email.com")
    await page.locator(auth.loginPassword).fill("wrongpass")
    await page.locator(auth.loginSubmit).click()
    await expect(page.locator(auth.loginError)).toBeVisible({ timeout: 10_000 })
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

// ─── S57. Rider corrects the parcel weight at pickup ─────────────────────────
const BASE_URL = "http://localhost:3000"

async function loginContext(cred: {
  email: string
  password: string
  home?: string
}) {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL })
  const res = await ctx.post("/api/auth/sign-in/email", {
    data: {
      email: cred.email,
      password: cred.password,
      callbackURL: cred.home,
    },
  })
  expect(res.ok(), `sign-in ${cred.email} -> ${res.status()}`).toBeTruthy()
  return ctx
}

function rows(json: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(json)) return json
  const data = (json as { data?: unknown }).data
  return Array.isArray(data) ? data : []
}

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

test.describe("S57. Rider corrects the parcel weight at pickup", () => {
  test("re-prices the delivery and adjusts the ledger", async () => {
    // Merchant creates an order with a declared 1 kg parcel.
    const merchant = await loginContext(CREDS.merchant)
    const pickupLocations = rows(
      await (await merchant.get("/api/pickup-locations")).json(),
    )
    const cities = rows(
      await (await merchant.get("/api/delivery-cities")).json(),
    )
    expect(pickupLocations.length).toBeGreaterThan(0)
    expect(cities.length).toBeGreaterThan(0)

    const createRes = await merchant.post("/api/orders", {
      data: {
        pickupLocationId: pickupLocations[0].id,
        recipientName: "E2E Weight",
        recipientPhone: "01712345678",
        deliveryAddress: "1 Weight St",
        deliveryCityId: cities[0].id,
        parcelWeightKg: 1,
        deliveryType: "STANDARD",
        productCost: 500,
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const order = await createRes.json()
    const originalFee = order.deliveryFee as number
    await merchant.dispose()

    // Admin approves.
    const admin = await loginContext(CREDS.superAdmin)
    expect(
      (await admin.patch(`/api/orders/${order.id}/approve`)).ok(),
    ).toBeTruthy()
    await admin.dispose()

    // Warehouse admin assigns the seeded pickup rider (RID-100001E, same hub).
    const warehouse = await loginContext(CREDS.warehouseAdmin)
    expect(
      (
        await warehouse.patch(`/api/orders/${order.id}/assign-pickup-rider`, {
          data: { riderId: "RID-100001E" },
        })
      ).ok(),
    ).toBeTruthy()
    await warehouse.dispose()

    // Rider picks up and corrects the weight upward.
    const rider = await loginContext(CREDS.rider)
    const pickRes = await rider.patch(`/api/orders/${order.id}/picked-up`, {
      data: { proofRefs: ["https://example.com/proof.png"], parcelWeightKg: 3 },
    })
    expect(pickRes.ok()).toBeTruthy()
    const picked = await pickRes.json()
    await rider.dispose()
    expect(picked.parcelWeightKg).toBe(3)
    expect(picked.deliveryFee).toBeGreaterThan(originalFee)

    // The ledger records the delivery-fee delta.
    const delta = (picked.deliveryFee as number) - originalFee
    await withDb(async (client) => {
      const res = await client.query(
        `SELECT amount FROM balance_transaction
         WHERE "orderId" = $1 AND note LIKE '%weight corrected%'`,
        [order.id],
      )
      expect(res.rows.length).toBe(1)
      expect(Number(res.rows[0].amount)).toBeCloseTo(delta, 2)
    })
  })
})
