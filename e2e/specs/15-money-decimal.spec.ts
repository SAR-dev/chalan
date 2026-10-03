import "dotenv/config"

import { expect, test } from "@playwright/test"
import { Client } from "pg"

// ─── S48. Money is stored as exact decimal ────────────────────
//
// Every money column used to be `double precision`: a binary float where 0.1 is
// really 0.1000000000000000055511151231257827…, so a ledger of such values
// drifts and can never be audited exactly. Rounding happens at each write boundary,
// but only the storage type makes the audit exact. Weights and percentages
// deliberately stay floating — they are measurements, not money.

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

const MONEY_COLUMNS: [string, string][] = [
  ["balance_transaction", "amount"],
  ["merchant_balance", "balance"],
  ["merchant_balance", "pendingBalance"],
  ["zone_pricing", "baseRate"],
  ["zone_pricing", "extraRatePerKg"],
  // The cancellation fee is per lane, snapshotted onto the order. It used to
  // also live as `platform_config.defaultCancellationFee` — a platform-wide
  // fallback that no longer exists, so the zone row is now the only source.
  ["zone_pricing", "cancellationFee"],
  ["order", "productCost"],
  ["order", "deliveryFee"],
  ["order", "codFee"],
  ["order", "cancellationFee"],
  ["order", "merchantEarnings"],
  ["order", "amountCollected"],
  ["payout_request", "amount"],
]

const NON_MONEY_COLUMNS: [string, string][] = [
  ["order", "parcelWeightKg"],
  // NOTE: no `merchant.maxWeightKg` — the weight limit belongs to the lane.
  ["zone_pricing", "freeWeightKg"],
  ["zone_pricing", "maxWeightKg"],
  ["zone_pricing", "codFeePercentage"],
]

test.describe("S48. Money is stored as exact decimal", () => {
  test("every money column is numeric(14,2)", async () => {
    const rows = await withDb(async (client) => {
      const res = await client.query<{
        table_name: string
        column_name: string
        data_type: string
        numeric_precision: number | null
        numeric_scale: number | null
      }>(
        `SELECT table_name, column_name, data_type,
                numeric_precision, numeric_scale
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (table_name, column_name) IN (
              ${MONEY_COLUMNS.map(([t, c]) => `('${t}', '${c}')`).join(", ")}
            )`,
      )
      return res.rows
    })

    expect(rows).toHaveLength(MONEY_COLUMNS.length)
    for (const row of rows) {
      expect(
        { ...row, data_type: row.data_type },
        `${row.table_name}.${row.column_name}`,
      ).toMatchObject({
        data_type: "numeric",
        numeric_precision: 14,
        numeric_scale: 2,
      })
    }
  })

  test("weights and percentages are still floating point", async () => {
    const rows = await withDb(async (client) => {
      const res = await client.query<{ table_name: string; data_type: string }>(
        `SELECT table_name, data_type
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (table_name, column_name) IN (
              ${NON_MONEY_COLUMNS.map(([t, c]) => `('${t}', '${c}')`).join(
                ", ",
              )}
            )`,
      )
      return res.rows
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.data_type, `${row.table_name}`).toBe("double precision")
    }
  })

  test("the ledger reconciles exactly, not approximately", async () => {
    // With numeric storage both sides are compared by PostgreSQL itself, so
    // the invariant is an exact equality rather than a float tolerance.
    const rows = await withDb(async (client) => {
      const res = await client.query<{
        merchantId: string
        balance: string
        balance_scale: number | null
        exact_match: boolean
      }>(
        `SELECT mb."merchantId",
                mb.balance::text AS balance,
                scale(mb.balance) AS balance_scale,
                mb.balance = (
                  SELECT coalesce(sum(bt.amount), 0)
                    FROM balance_transaction bt
                   WHERE bt."merchantId" = mb."merchantId"
                     AND bt.status = 'SETTLED'
                ) AS exact_match
           FROM merchant_balance mb`,
      )
      return res.rows
    })

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      // Exactly two decimals of storage precision…
      expect(row.balance_scale, row.merchantId).toBe(2)
      // …and the balance equals the settled ledger to the paisa.
      expect(row.exact_match, `${row.merchantId} balance=${row.balance}`).toBe(
        true,
      )
    }
  })
})
