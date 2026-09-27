import "dotenv/config"

import { type APIRequestContext, expect, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS } from "../helpers"

// ─── S49. Concurrency guards (ROADMAP P1.1) ─────────────────────────────────
//
// Each flow below used to be a check-then-write: two simultaneous requests
// both passed the check and both wrote. These tests fire the two requests at
// the same time against the real database and assert the invariant holds —
// the row lock and the unique indexes are what make the outcome deterministic.

const MERCHANT1_ID = "MER-100001E"

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

async function signInAsMerchant(request: APIRequestContext) {
  const res = await request.post("/api/auth/sign-in/email", {
    data: {
      email: CREDS.merchant.email,
      password: CREDS.merchant.password,
      callbackURL: "/merchant",
    },
  })
  expect(res.ok()).toBeTruthy()
}

async function signInAsAdmin(request: APIRequestContext) {
  const res = await request.post("/api/auth/sign-in/email", {
    data: {
      email: CREDS.superAdmin.email,
      password: CREDS.superAdmin.password,
      callbackURL: "/dashboard",
    },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe("S49. Concurrency guards", () => {
  test("two concurrent payment submissions leave exactly one pending payment", async ({
    request,
  }) => {
    await signInAsMerchant(request)

    const baseline = await withDb(async (client) => {
      // Start from a clean slate so the race is about the two requests below.
      await client.query(
        `DELETE FROM balance_transaction
          WHERE "merchantId" = $1 AND type = 'PAYMENT_PENDING' AND status = 'PENDING'`,
        [MERCHANT1_ID],
      )
      const res = await client.query(
        `SELECT "pendingBalance" FROM merchant_balance WHERE "merchantId" = $1`,
        [MERCHANT1_ID],
      )
      return Number(res.rows[0]?.pendingBalance ?? 0)
    })

    const amount = 300
    const body = {
      amount,
      paymentMethod: "bkash",
      paymentAccount: "01700000000",
    }
    const [a, b] = await Promise.all([
      request.post(`/api/merchants/${MERCHANT1_ID}/balance/payment`, {
        data: body,
      }),
      request.post(`/api/merchants/${MERCHANT1_ID}/balance/payment`, {
        data: body,
      }),
    ])

    // One wins, the other is rejected by the row lock + unique index — never
    // two 201s (the double-reservation bug) and never a 500.
    expect([a.status(), b.status()].sort((x, y) => x - y)).toEqual([201, 409])

    const after = await withDb(async (client) => {
      const pending = await client.query(
        `SELECT count(*)::int AS count FROM balance_transaction
          WHERE "merchantId" = $1 AND type = 'PAYMENT_PENDING' AND status = 'PENDING'`,
        [MERCHANT1_ID],
      )
      const bal = await client.query(
        `SELECT "pendingBalance" FROM merchant_balance WHERE "merchantId" = $1`,
        [MERCHANT1_ID],
      )
      return {
        pending: Number(pending.rows[0]?.count ?? 0),
        pendingBalance: Number(bal.rows[0]?.pendingBalance ?? 0),
      }
    })

    expect(after.pending).toBe(1)
    // The reserved amount is applied exactly once.
    expect(after.pendingBalance).toBeCloseTo(baseline + amount, 2)
  })

  test("two concurrent saves for one zone pair produce a single row", async ({
    request,
  }) => {
    await signInAsAdmin(request)

    const fromZoneId = "DZ-100003E"
    const toZoneId = "DZ-100002E"
    await withDb((client) =>
      client.query(
        `DELETE FROM zone_pricing WHERE "fromZoneId" = $1 AND "toZoneId" = $2`,
        [fromZoneId, toZoneId],
      ),
    )

    const body = {
      fromZoneId,
      toZoneId,
      baseRate: 111,
      extraRatePerKg: 11,
      freeWeightKg: 1,
      maxWeightKg: 10,
      codFeePercentage: 1,
    }
    const [a, b] = await Promise.all([
      request.post("/api/admin/zone-pricing", { data: body }),
      request.post("/api/admin/zone-pricing", { data: body }),
    ])

    // One creates (201), the other updates the row it just created (200).
    expect([a.status(), b.status()].sort((x, y) => x - y)).toEqual([200, 201])

    const rows = await withDb((client) =>
      client.query(
        `SELECT count(*)::int AS count FROM zone_pricing
          WHERE "fromZoneId" = $1 AND "toZoneId" = $2`,
        [fromZoneId, toZoneId],
      ),
    )
    expect(Number(rows.rows[0]?.count ?? 0)).toBe(1)
  })

  test("two concurrent applications for one email create one rider and no orphan user", async ({
    request,
  }) => {
    const email = `race-${Date.now()}@example.com`
    const body = {
      name: "Race Rider",
      email,
      phone: "01712345678",
      zone: "Dhaka",
      address: "1 Race Road",
      nidNumber: "1234567890123",
      warehouseId: "WH-100001E",
      password: "password123",
    }

    const [a, b] = await Promise.all([
      request.post("/api/rider-applications", { data: body }),
      request.post("/api/rider-applications", { data: body }),
    ])

    // The loser is rejected either by Better Auth's user-email constraint or
    // by `rider_email_uniq`; both surface as a 400.
    expect([a.status(), b.status()].sort((x, y) => x - y)).toEqual([201, 400])

    const counts = await withDb(async (client) => {
      const riders = await client.query(
        `SELECT count(*)::int AS count FROM rider WHERE lower(email) = lower($1)`,
        [email],
      )
      const users = await client.query(
        `SELECT count(*)::int AS count FROM "user" WHERE lower(email) = lower($1)`,
        [email],
      )
      return {
        riders: Number(riders.rows[0]?.count ?? 0),
        users: Number(users.rows[0]?.count ?? 0),
      }
    })

    expect(counts.riders).toBe(1)
    // Exactly the winner's account — the loser's orphan user was cleaned up.
    expect(counts.users).toBe(1)
  })
})
