import "dotenv/config"

import { type APIRequestContext, expect, test } from "@playwright/test"
import { Client } from "pg"
import { CREDS } from "../helpers"

// ─── 1401. Payout settlement ──────────────────────────────────

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

test.describe("1401. Payout settlement", () => {
  test("bulk mark-paid writes the ledger and debits the balance exactly once", async ({
    request,
  }) => {
    await signInAsAdmin(request)

    // Retry-safe: a previous run (or a CI retry) has already marked this payout
    // PAID and written its PAYOUT ledger row, which would leave nothing in the
    // APPROVED state to settle. Reset the payout and rebuild the balance from
    // the ledger - the same invariant the second test in this file asserts.
    const targetId = await withDb(async (client) => {
      const { rows } = await client.query(
        `SELECT id, "merchantId" FROM payout_request ORDER BY id LIMIT 1`,
      )
      const row = rows[0] as { id: string; merchantId: string } | undefined
      if (!row) throw new Error("No seeded payout request found")

      await client.query(
        `DELETE FROM balance_transaction WHERE type = 'PAYOUT' AND "merchantId" = $1`,
        [row.merchantId],
      )
      // Leave `amount` alone: the seeded value already matches the orders
      // linked to the request, and the endpoint recomputes it anyway.
      await client.query(
        `UPDATE payout_request SET status = 'APPROVED', "paidAt" = NULL
          WHERE id = $1`,
        [row.id],
      )
      await client.query(
        `UPDATE merchant_balance mb
            SET balance = (SELECT coalesce(sum(bt.amount), 0)
                             FROM balance_transaction bt
                            WHERE bt."merchantId" = mb."merchantId"
                              AND bt.status = 'SETTLED')
          WHERE mb."merchantId" = $1`,
        [row.merchantId],
      )
      return row.id
    })

    const before = await withDb(async (client) => {
      const payout = await client.query(
        `SELECT id, "merchantId", amount FROM payout_request WHERE id = $1`,
        [targetId],
      )
      const row = payout.rows[0] as
        | { id: string; merchantId: string; amount: string }
        | undefined
      if (!row) throw new Error("Payout request vanished during reset")

      const balance = await client.query(
        `SELECT balance FROM merchant_balance WHERE "merchantId" = $1`,
        [row.merchantId],
      )
      const ledger = await client.query(
        `SELECT count(*)::int AS count FROM balance_transaction
         WHERE "merchantId" = $1 AND type = 'PAYOUT'`,
        [row.merchantId],
      )
      const linked = await client.query(
        `SELECT count(*)::int AS count FROM "order" WHERE "payoutRequestId" = $1`,
        [row.id],
      )
      return {
        id: row.id,
        merchantId: row.merchantId,
        // Numeric(14,2) comes back from the driver as a string.
        amount: Number(row.amount),
        balance: Number(balance.rows[0]?.balance ?? 0),
        payoutRows: Number(ledger.rows[0]?.count ?? 0),
        linkedOrders: Number(linked.rows[0]?.count ?? 0),
      }
    })

    // The seeded payout owns its orders (the seed links them).
    expect(before.linkedOrders).toBeGreaterThan(0)

    const res = await request.patch("/api/payouts/bulk/mark-paid", {
      data: { ids: [before.id] },
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, count: 1 })

    const after = await withDb(async (client) => {
      const payout = await client.query(
        `SELECT status, amount FROM payout_request WHERE id = $1`,
        [before.id],
      )
      const balance = await client.query(
        `SELECT balance FROM merchant_balance WHERE "merchantId" = $1`,
        [before.merchantId],
      )
      const ledger = await client.query(
        `SELECT count(*)::int AS count FROM balance_transaction
         WHERE "merchantId" = $1 AND type = 'PAYOUT'`,
        [before.merchantId],
      )
      return {
        status: payout.rows[0]?.status as string,
        amount: Number(payout.rows[0]?.amount ?? 0),
        balance: Number(balance.rows[0]?.balance ?? 0),
        payoutRows: Number(ledger.rows[0]?.count ?? 0),
      }
    })

    expect(after.status).toBe("PAID")
    expect(after.amount).toBeCloseTo(before.amount, 2)
    // Exactly one new ledger row, and the balance moves TOWARD zero: a payout
    // consumes the merchant's credit (positive amount in the debt convention).
    expect(after.payoutRows).toBe(before.payoutRows + 1)
    expect(after.balance).toBeCloseTo(before.balance + before.amount, 2)
  })

  test("every merchant balance equals the sum of its SETTLED ledger rows", async ({
    request,
  }) => {
    // The reconciliation invariant from lib/balance-ledger.ts, verified against
    // the real database after the payout above has moved money.
    await signInAsAdmin(request)

    const rows = await withDb(async (client) => {
      const res = await client.query(
        `SELECT mb."merchantId",
                mb.balance,
                (SELECT coalesce(sum(bt.amount), 0)
                   FROM balance_transaction bt
                  WHERE bt."merchantId" = mb."merchantId"
                    AND bt.status = 'SETTLED') AS ledger_sum
           FROM merchant_balance mb`,
      )
      return res.rows as {
        merchantId: string
        // Numeric columns arrive as strings from the driver.
        balance: string
        ledger_sum: string
      }[]
    })

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Number(row.balance)).toBeCloseTo(Number(row.ledger_sum), 2)
    }
  })

  test("an orphan payout request (no linked orders) is refused", async ({
    request,
  }) => {
    await signInAsAdmin(request)

    const orphanId = `PR-E2E-${Date.now()}`
    const { merchantId, balanceBefore, payoutRowsBefore } = await withDb(
      async (client) => {
        const merchant = await client.query(
          `SELECT "merchantId" FROM payout_request ORDER BY id LIMIT 1`,
        )
        const id = merchant.rows[0]?.merchantId as string
        const balance = await client.query(
          `SELECT balance FROM merchant_balance WHERE "merchantId" = $1`,
          [id],
        )
        const ledger = await client.query(
          `SELECT count(*)::int AS count FROM balance_transaction
           WHERE "merchantId" = $1 AND type = 'PAYOUT'`,
          [id],
        )
        // An APPROVED request carrying an amount but referencing no orders —
        // exactly the shape the old create race could produce.
        await client.query(
          `INSERT INTO payout_request
             (id, "merchantId", "orderIds", amount, status, "payoutMethod", "payoutDetails", "requestedAt")
           VALUES ($1, $2, '[]'::jsonb, 500, 'APPROVED', 'bKash', '01712345678', now())`,
          [orphanId, id],
        )
        return {
          merchantId: id,
          balanceBefore: Number(balance.rows[0]?.balance ?? 0),
          payoutRowsBefore: Number(ledger.rows[0]?.count ?? 0),
        }
      },
    )

    try {
      const res = await request.patch(`/api/payouts/${orphanId}/paid`)
      expect(res.status()).toBe(400)
      expect(await res.json()).toMatchObject({
        error: "This payout request has no linked orders.",
      })

      const { status, balanceAfter, payoutRows } = await withDb(
        async (client) => {
          const payout = await client.query(
            `SELECT status FROM payout_request WHERE id = $1`,
            [orphanId],
          )
          const balance = await client.query(
            `SELECT balance FROM merchant_balance WHERE "merchantId" = $1`,
            [merchantId],
          )
          const ledger = await client.query(
            `SELECT count(*)::int AS count FROM balance_transaction
           WHERE "merchantId" = $1 AND type = 'PAYOUT'`,
            [merchantId],
          )
          return {
            status: payout.rows[0]?.status as string,
            balanceAfter: Number(balance.rows[0]?.balance ?? 0),
            payoutRows: Number(ledger.rows[0]?.count ?? 0),
          }
        },
      )

      // Nothing moved: still APPROVED, no new ledger row, balance untouched.
      expect(status).toBe("APPROVED")
      expect(balanceAfter).toBeCloseTo(balanceBefore, 2)
      expect(payoutRows).toBe(payoutRowsBefore)
    } finally {
      await withDb((client) =>
        client.query(`DELETE FROM payout_request WHERE id = $1`, [orphanId]),
      )
    }
  })
})
