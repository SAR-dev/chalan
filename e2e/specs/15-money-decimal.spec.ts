import "dotenv/config"

import { expect, test } from "@playwright/test"
import { Client } from "pg"

// ─── S48. Money is stored as exact decimal (ROADMAP P0.8) ────────────────────
//
// Every money column used to be `double precision`: a binary float where 0.1 is
// really 0.1000000000000000055511151231257827…, so a ledger of such values
// drifts and can never be audited exactly. P0.4 rounds at each write boundary,
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
  ["order", "productCost"],
  ["order", "deliveryFee"],
  ["order", "codFee"],
  ["order", "merchantEarnings"],
  ["order", "amountCollected"],
  ["payout_request", "amount"],
  ["platform_config", "defaultBaseRate"],
  ["platform_config", "defaultExtraRatePerKg"],
]

const NON_MONEY_COLUMNS: [string, string][] = [
  ["order", "parcelWeightKg"],
  ["merchant", "maxWeightKg"],
  ["zone_pricing", "freeWeightKg"],
  ["zone_pricing", "maxWeightKg"],
  ["zone_pricing", "codFeePercentage"],
  ["platform_config", "defaultCodFeePercentage"],
  ["platform_config", "defaultFreeWeightKg"],
  ["platform_config", "defaultMaxWeightKg"],
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
    // the P0.4 invariant is an exact equality rather than a float tolerance.
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
