import "dotenv/config"

import { expect, test } from "@playwright/test"
import { Client } from "pg"

// ─── S46. Server-side session gates (ROADMAP P0.5) ──────────────────────────
//
// The 2FA-policy and merchant-email-verification rules used to be enforced in
// the browser only, so any authenticated session could call the APIs directly.
// These tests sign in over the raw API (bypassing the login page's client-side
// gates) and assert what the server does with a blocked session.
//
// One merchant is registered for the whole file: the public registration
// endpoint allows 3 per minute per IP and the suite shares 127.0.0.1.

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

const PASSWORD = "testpass123"
const merchant = { email: "", password: PASSWORD }

test.describe("S46. Server-side session gates", () => {
  test.beforeAll(async ({ request }) => {
    merchant.email = `e2e-gate-${Date.now()}@test.com`
    const reg = await request.post("/api/merchants", {
      data: {
        businessName: `E2E Gate ${Date.now()}`,
        ownerName: "E2E Gate Owner",
        email: merchant.email,
        phone: "+8801710000044",
        address: "E2E Gate Address, Dhaka",
        businessType: "E-commerce",
        password: PASSWORD,
      },
    })
    expect(reg.ok()).toBeTruthy()
  })

  test("an unverified merchant session is refused by the API until the email is verified", async ({
    request,
  }) => {
    // Sign in over the API — the session cookie is real, the login page's
    // client-side "verify your email" gate is not involved.
    const signIn = await request.post("/api/auth/sign-in/email", {
      data: {
        email: merchant.email,
        password: merchant.password,
        callbackURL: "/merchant",
      },
    })
    expect(signIn.ok()).toBeTruthy()

    // The account-state endpoint still answers, so the client can render the
    // "check your email" state (it does not go through requireSession).
    const me = await request.get("/api/users/me")
    expect(me.ok()).toBeTruthy()
    expect((await me.json()).emailVerifiedAt).toBeFalsy()

    // Every business API is closed to this session (P0.5).
    for (const url of ["/api/orders", "/api/pickup-locations", "/api/team"]) {
      const res = await request.get(url)
      expect(
        res.status(),
        `${url} must be 401 for an unverified merchant`,
      ).toBe(401)
    }

    // The write path is closed too, not just reads.
    const create = await request.post("/api/orders", {
      data: {
        pickupLocationId: "pl_1",
        deliveryCityId: "dc_1",
        parcelWeightKg: 1,
        productCost: 100,
        deliveryFee: 10,
        codFee: 5,
        recipientName: "Gate Test",
        recipientPhone: "+8801700000000",
        recipientAddress: "Dhaka",
      },
    })
    expect(create.status()).toBe(401)

    // Verifying the merchant in the DB opens the same session up.
    await withDb(async (client) => {
      await client.query(
        `UPDATE merchant SET "emailVerifiedAt" = now(), status = 'ACTIVE',
                            "approvedAt" = now(), "approvedBy" = 'e2e'
          WHERE email = $1`,
        [merchant.email],
      )
      await client.query(
        `UPDATE "user" SET "emailVerified" = true WHERE email = $1`,
        [merchant.email],
      )
    })

    const after = await request.get("/api/orders")
    expect(after.status()).toBe(200)
  })

  test("a banned user's session is refused by the API", async ({ request }) => {
    // Same merchant, now verified and ACTIVE (set up by the test above). Each
    // test gets a fresh cookie jar, so sign in again.
    const signIn = await request.post("/api/auth/sign-in/email", {
      data: {
        email: merchant.email,
        password: merchant.password,
        callbackURL: "/merchant",
      },
    })
    expect(signIn.ok()).toBeTruthy()

    await withDb(async (client) => {
      await client.query(`UPDATE "user" SET banned = true WHERE email = $1`, [
        merchant.email,
      ])
    })

    const orders = await request.get("/api/orders")
    expect(orders.status()).toBe(401)

    // Unbanning restores access for the same session.
    await withDb(async (client) => {
      await client.query(`UPDATE "user" SET banned = false WHERE email = $1`, [
        merchant.email,
      ])
    })
    const restored = await request.get("/api/orders")
    expect(restored.status()).toBe(200)
  })
})
