import "dotenv/config"

import { type APIRequestContext, expect, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS } from "../helpers"

// ─── S51. Order status history (ROADMAP P1.4) ───────────────────────────────
//
// Every lifecycle transition writes an append-only `order_status_history` row
// in the same transaction. A `reattempt` clears the failure fields on the
// order row, so without the history the prior failure would be erased.

const RIDER1_ID = "RID-100001E"
const WAREHOUSE_ID = "WH-100001E"

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

async function signIn(
  request: APIRequestContext,
  cred: { email: string; password: string },
  callbackURL: string,
) {
  const res = await request.post("/api/auth/sign-in/email", {
    data: { email: cred.email, password: cred.password, callbackURL },
    // A second sign-in in the same context carries the first session cookie,
    // which makes Better Auth enforce the Origin header.
    headers: { origin: "http://localhost:3000" },
  })
  expect(res.ok()).toBeTruthy()
}

test.describe("S51. Order status history", () => {
  test("reattempt preserves the prior failed attempt in the history", async ({
    request,
  }) => {
    const setup = await withDb(async (client) => {
      const sel = await client.query(
        `SELECT id, status, "deliveryRiderId", "warehouseId", "failureNote", "failedAttemptAt"
           FROM "order" ORDER BY id LIMIT 1`,
      )
      const row = sel.rows[0] as Record<string, unknown> | undefined
      if (!row) throw new Error("No seeded order found")
      const id = row.id as string

      await client.query(
        `DELETE FROM order_status_history WHERE "orderId" = $1`,
        [id],
      )
      // Put the order OUT_FOR_DELIVERY with rider1 as its delivery rider and
      // the order held at warehouse.admin1's warehouse.
      await client.query(
        `UPDATE "order"
            SET status = 'OUT_FOR_DELIVERY',
                "deliveryRiderId" = $2,
                "warehouseId" = $3,
                "failureNote" = NULL,
                "failedAttemptAt" = NULL,
                "deliveryAttempts" = 1
          WHERE id = $1`,
        [id, RIDER1_ID, WAREHOUSE_ID],
      )
      return { id, original: row }
    })

    try {
      // 1. The delivery rider marks the attempt failed (with a note).
      await signIn(request, CREDS.rider, "/rider")
      const failed = await request.patch(`/api/orders/${setup.id}/failed`, {
        data: { note: "recipient unreachable" },
      })
      expect(failed.status()).toBe(200)

      // 2. The warehouse admin schedules a reattempt.
      await signIn(request, CREDS.warehouseAdmin, "/warehouse")
      const reattempt = await request.patch(`/api/orders/${setup.id}/reattempt`)
      expect(reattempt.status()).toBe(200)
      const updated = (await reattempt.json()) as {
        status: string
        failureNote: string | null
      }
      // The order row forgets the failure…
      expect(updated.status).toBe("OUT_FOR_DELIVERY")
      expect(updated.failureNote).toBeNull()

      // …but the history keeps both transitions.
      const history = await withDb((client) =>
        client.query(
          `SELECT "fromStatus", "toStatus", transition, note
             FROM order_status_history
            WHERE "orderId" = $1
            ORDER BY "createdAt" ASC, id ASC`,
          [setup.id],
        ),
      )
      const rows = history.rows as {
        fromStatus: string | null
        toStatus: string
        transition: string
        note: string | null
      }[]
      expect(rows.map((r) => r.transition)).toEqual(["failed", "reattempt"])
      expect(rows[0]).toMatchObject({
        fromStatus: "OUT_FOR_DELIVERY",
        toStatus: "FAILED_ATTEMPT",
        note: "recipient unreachable",
      })
      expect(rows[1]).toMatchObject({
        fromStatus: "FAILED_ATTEMPT",
        toStatus: "OUT_FOR_DELIVERY",
      })
    } finally {
      await withDb(async (client) => {
        await client.query(
          `DELETE FROM order_status_history WHERE "orderId" = $1`,
          [setup.id],
        )
        await client.query(
          `UPDATE "order"
              SET status = $2,
                  "deliveryRiderId" = $3,
                  "warehouseId" = $4,
                  "failureNote" = $5,
                  "failedAttemptAt" = $6
            WHERE id = $1`,
          [
            setup.id,
            setup.original.status,
            setup.original.deliveryRiderId,
            setup.original.warehouseId,
            setup.original.failureNote,
            setup.original.failedAttemptAt,
          ],
        )
      })
    }
  })
})
