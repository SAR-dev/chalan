import "dotenv/config"

import { type APIRequestContext, expect, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS } from "../helpers"

// ─── S50. Business timezone (ROADMAP P1.3) ──────────────────────────────────
//
// The business runs in Asia/Dhaka (UTC+6) but containers/database default to
// UTC. Day-bucketed analytics and date-range filters must use the Dhaka
// calendar day, not the session day.

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

async function ordersByDay(
  request: APIRequestContext,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const res = await request.get(`/api/orders/analytics?from=${from}&to=${to}`)
  expect(res.ok()).toBeTruthy()
  const json = (await res.json()) as {
    ordersByDay: { date: string; count: number }[]
  }
  return new Map(json.ordersByDay.map((d) => [d.date, d.count]))
}

test.describe("S50. Business timezone (Asia/Dhaka)", () => {
  test("day buckets and date ranges use the Dhaka calendar day", async ({
    request,
  }) => {
    await signInAsMerchant(request)

    // 2031-03-15T20:00Z is 2031-03-16 02:00 in Dhaka. Nothing is seeded in
    // 2031, so the resulting buckets are unambiguous.
    const moved = await withDb(async (client) => {
      const sel = await client.query(
        `SELECT id, "createdAt" FROM "order" WHERE "merchantId" = $1 ORDER BY id LIMIT 1`,
        [MERCHANT1_ID],
      )
      const id = sel.rows[0]?.id as string | undefined
      if (!id) throw new Error("No seeded order for merchant1")
      await client.query(`UPDATE "order" SET "createdAt" = $1 WHERE id = $2`, [
        "2031-03-15T20:00:00.000Z",
        id,
      ])
      return { id, originalCreatedAt: sel.rows[0]?.createdAt as string }
    })

    try {
      // Analytics bucket: the order belongs to the Dhaka day 2031-03-16.
      const day16 = await ordersByDay(request, "2031-03-16", "2031-03-16")
      expect(day16.get("2031-03-16")).toBeGreaterThanOrEqual(1)

      // The previous Dhaka day must not contain it (nor a 03-16 bucket).
      const day15 = await ordersByDay(request, "2031-03-15", "2031-03-15")
      expect(day15.has("2031-03-16")).toBe(false)
      expect(day15.has("2031-03-15")).toBe(false)

      // The list endpoint's date range agrees with the bucket.
      const list15 = await request.get(
        "/api/orders?from=2031-03-15&to=2031-03-15",
      )
      const json15 = (await list15.json()) as { data: { id: string }[] }
      expect(json15.data.some((o) => o.id === moved.id)).toBe(false)

      const list16 = await request.get(
        "/api/orders?from=2031-03-16&to=2031-03-16",
      )
      const json16 = (await list16.json()) as { data: { id: string }[] }
      expect(json16.data.some((o) => o.id === moved.id)).toBe(true)
    } finally {
      await withDb((client) =>
        client.query(`UPDATE "order" SET "createdAt" = $1 WHERE id = $2`, [
          moved.originalCreatedAt,
          moved.id,
        ]),
      )
    }
  })
})
