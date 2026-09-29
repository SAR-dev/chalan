import "dotenv/config"

import { expect, test } from "@playwright/test"
import { Client } from "pg"
import { auth, register } from "../selectors"

// ─── S47. Public signup is closed (ROADMAP P0.7) ────────────────────────────
//
// Accounts are only ever created server-side (merchant application, admin /
// owner invites). Better Auth's public email sign-up was left enabled, so
// `POST /api/auth/sign-up/email` created a password-only user with no profile
// row — a session that authenticated but belonged to no portal.

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

test.describe("S47. Public signup is closed", () => {
  test("the public sign-up endpoint refuses to create an account", async ({
    request,
  }) => {
    const email = `e2e-signup-${Date.now()}@test.com`

    const res = await request.post("/api/auth/sign-up/email", {
      data: { email, password: "testpass123", name: "E2E Signup" },
    })
    expect(res.ok()).toBeFalsy()
    expect(res.status()).toBeGreaterThanOrEqual(400)

    // No user row was created — the endpoint rejected before any write.
    const rows = await withDb(async (client) => {
      const res = await client.query(`SELECT id FROM "user" WHERE email = $1`, [
        email,
      ])
      return res.rows
    })
    expect(rows).toHaveLength(0)
  })

  test("the public /register page is still the merchant application form", async ({
    page,
  }) => {
    // Closing Better Auth's sign-up must not close the legitimate path: every
    // account is created server-side from this application form.
    await page.goto("/register")
    await expect(page.locator(auth.registerForm)).toBeVisible()
    await expect(page.locator(register.businessName)).toBeVisible()
    await expect(page.locator(register.email)).toBeVisible()
  })
})
