import "dotenv/config"
import { Client } from "pg"

// =============================================================================
// Schema invariant audit (DBREFACTOR Phase A)
//
// `ALTER TABLE … ADD CONSTRAINT` validates every existing row. So the question
// "can we constrain this?" is answered *before* writing any DDL: this script
// counts the rows that already break each candidate rule, and names five of
// them.
//
// Two things follow from that ordering:
//   - A rule with violations gets a data decision first (fix the rows, or drop
//     the rule). Writing data to satisfy a constraint is the wrong way round —
//     a rule that needs history rewritten to hold is describing an aspiration.
//   - A rule measuring zero violations is still not automatically safe to add.
//     This reports; it does not decide.
//
// `measuredOnly` entries are deliberate exclusions from Phase C/D. They are
// audited for a different reason: to prove the exclusion was correct rather
// than merely cautious. If one of these ever measures zero, the reasoning that
// excluded it has gone stale and should be revisited.
//
// Run: `pnpm db:audit-invariants` (exit 1 if any enforced rule is violated).
// =============================================================================

interface Invariant {
  /** Stable identifier used in DBREFACTOR.md and in the migration comments. */
  key: string
  /** Human description of the rule, including why the pairing is incoherent. */
  rule: string
  /** The `WHERE` fragment selecting violating rows. */
  where: string
  /** Columns selected as samples, so a violation is identifiable by eye. */
  sampleColumns?: string
  /**
   * `false` for rules this codebase deliberately does *not* enforce. Reported
   * for the exclusion argument; never fails the run.
   */
  measuredOnly?: boolean
}

const INVARIANTS: Invariant[] = [
  // ── Lifecycle pairings ─────────────────────────────────────────────────────
  {
    key: "order_delivered_needs_delivered_at",
    rule: "status = 'DELIVERED' requires deliveredAt IS NOT NULL",
    where: `"status" = 'DELIVERED' AND "deliveredAt" IS NULL`,
  },
  {
    key: "order_cancelled_needs_cancelled_at",
    rule: "status = 'CANCELLED' requires cancelledAt IS NOT NULL",
    where: `"status" = 'CANCELLED' AND "cancelledAt" IS NULL`,
  },
  {
    key: "order_returned_needs_returned_at",
    rule: "status = 'RETURNED' requires returnedAt IS NOT NULL",
    where: `"status" = 'RETURNED' AND "returnedAt" IS NULL`,
  },
  {
    key: "order_picked_up_needs_picked_up_at",
    rule: "status = 'PICKED_UP' requires pickedUpAt IS NOT NULL",
    where: `"status" = 'PICKED_UP' AND "pickedUpAt" IS NULL`,
  },
  {
    key: "order_out_for_pickup_needs_out_for_pickup_at",
    rule: "status = 'OUT_FOR_PICKUP' requires outForPickupAt IS NOT NULL",
    where: `"status" = 'OUT_FOR_PICKUP' AND "outForPickupAt" IS NULL`,
  },
  {
    key: "order_out_for_delivery_needs_out_for_delivery_at",
    rule: "status = 'OUT_FOR_DELIVERY' requires outForDeliveryAt IS NOT NULL",
    where: `"status" = 'OUT_FOR_DELIVERY' AND "outForDeliveryAt" IS NULL`,
  },

  // ── Money is never negative ────────────────────────────────────────────────
  {
    key: "order_product_cost_nonneg",
    rule: "productCost >= 0",
    where: `"productCost" < 0`,
  },
  {
    key: "order_delivery_fee_nonneg",
    rule: "deliveryFee >= 0",
    where: `"deliveryFee" < 0`,
  },
  {
    key: "order_cod_fee_nonneg",
    rule: "codFee >= 0",
    where: `"codFee" < 0`,
  },
  {
    key: "order_cancellation_fee_nonneg",
    rule: "cancellationFee >= 0",
    where: `"cancellationFee" < 0`,
  },
  {
    key: "order_merchant_earnings_nonneg",
    rule: "merchantEarnings >= 0",
    where: `"merchantEarnings" < 0`,
  },
  {
    key: "order_amount_collected_nonneg",
    rule: "amountCollected is NULL or >= 0 (nullable, so no bare NULL comparison)",
    where: `"amountCollected" IS NOT NULL AND "amountCollected" < 0`,
  },

  // ── Deliberately NOT enforced; measured to justify the exclusion ───────────
  {
    key: "cod_settled_implies_delivered",
    rule: "codSettledAt IS NOT NULL requires status = 'DELIVERED'",
    where: `"codSettledAt" IS NOT NULL AND "status" <> 'DELIVERED'`,
    sampleColumns: '"id", "status", "codSettledAt"',
    measuredOnly: true,
  },
  {
    key: "balance_tx_amount_sign",
    // Signed *by design*: a refund posts a negative row. This audit exists to
    // prove negatives are present and legitimate, so nobody later "fixes" the
    // column with a CHECK >= 0 and breaks the refund path.
    rule: "balance_transaction.amount may be negative (signed by design — NOT constrained)",
    where: `"amount" < 0`,
    sampleColumns: '"id", "type", "amount"',
    measuredOnly: true,
  },
]

const SAMPLE_LIMIT = 5

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const failures: string[] = []
  let enforcedCount = 0
  let infoCount = 0

  try {
    for (const inv of INVARIANTS) {
      // The ledger invariant targets a different table than the rest. `order` is
      // a reserved SQL keyword, so it must be quoted as an identifier.
      const from =
        inv.key === "balance_tx_amount_sign" ? "balance_transaction" : '"order"'

      const countSql = `SELECT count(*)::int AS violating FROM ${from} WHERE ${inv.where}`
      const { rows: countRows } = await client.query<{ violating: number }>(
        countSql,
      )
      const violating = Number(countRows[0]?.violating ?? 0)

      const { rows: totalRows } = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${from}`,
      )
      const total = Number(totalRows[0]?.total ?? 0)

      if (inv.measuredOnly) {
        infoCount++
        console.log(`\n[i] ${inv.key} — measured only, not enforced`)
        console.log(`    rule:      ${inv.rule}`)
        console.log(`    ${from}: ${violating} of ${total} rows match`)
        if (violating > 0) {
          const cols = inv.sampleColumns ?? '"id"'
          const { rows: samples } = await client.query<Record<string, unknown>>(
            `SELECT ${cols} FROM ${from} WHERE ${inv.where} LIMIT ${SAMPLE_LIMIT}`,
          )
          console.log(
            `    samples:   ${samples
              .map((s) => JSON.stringify(s))
              .join("  ")}`,
          )
        }
        continue
      }

      enforcedCount++
      if (violating === 0) {
        console.log(`\n[ok] ${inv.key} — 0 of ${total} ${from} rows violate`)
        continue
      }

      failures.push(inv.key)
      console.log(
        `\n[!!] ${inv.key} — ${violating} of ${total} ${from} rows violate`,
      )
      console.log(`    rule:      ${inv.rule}`)

      const cols = inv.sampleColumns ?? '"id", "status"'
      const { rows: samples } = await client.query<Record<string, unknown>>(
        `SELECT ${cols} FROM ${from} WHERE ${inv.where} LIMIT ${SAMPLE_LIMIT}`,
      )
      console.log(
        `    samples:   ${samples.map((s) => JSON.stringify(s)).join("  ")}`,
      )
    }

    console.log(
      `\n${"─".repeat(72)}\nAudited ${enforcedCount} enforced rule(s), ${infoCount} measured-only.`,
    )
    if (failures.length > 0) {
      console.error(
        `\n${failures.length} rule(s) are violated by existing data:\n  ${failures.join("\n  ")}\n\n` +
          "Resolve the data (or drop the rule) before adding a CHECK — a migration\n" +
          "that validates every existing row will fail otherwise.",
      )
      process.exitCode = 1
    } else {
      console.log("No enforced rule is violated by existing data.")
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("Invariant audit failed:", err)
  process.exit(1)
})
