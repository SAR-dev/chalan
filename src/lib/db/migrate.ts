import "dotenv/config"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client, Pool } from "pg"
import {
  MIGRATIONS_DIR,
  MIGRATIONS_SCHEMA,
  MIGRATIONS_TABLE,
  migrationHash,
  planLedgerReconciliation,
  readJournal,
} from "./migration-ledger"

// =============================================================================
// Database migration runner (ROADMAP P1.2)
//
// Wraps drizzle's own migrator instead of hand-rolling SQL execution:
//
//   - The journal (`meta/_journal.json`) is the source of truth for ordering;
//     each file is split on `--> statement-breakpoint`, NOT on `;`, so a
//     `$$`-quoted function body survives.
//   - The whole run happens in one transaction, so a failure rolls back
//     instead of leaving a half-applied migration.
//   - The ledger stores a SHA-256 content hash (not the filename), so a
//     renamed/regenerated file is never re-applied.
//   - Every runner (cluster service, manual run, CI) takes the same
//     database-wide advisory lock, so only one applies at a time.
//
// The previous runner keyed the ledger on the filename, split on `;`, and ran
// each statement outside a transaction — all three are fixed here.
// =============================================================================

// Fixed key: every instance queues on the same lock. Fits in a signed int8.
const ADVISORY_LOCK_KEY = "8462384756930276"

async function ledgerRowCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  )
  return Number(rows[0]?.n ?? 0)
}

/**
 * A database with tables but no recorded history was almost certainly created
 * with `drizzle-kit push` (or had its ledger dropped). Re-applying the init
 * migration would fail on the first existing sequence, so fail with the fix
 * instead of a cryptic Postgres error.
 */
async function assertHistoryOrFresh(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{
    ledger: string | null
    knownTable: string | null
  }>(
    'SELECT to_regclass($1)::text AS ledger, to_regclass($2)::text AS "knownTable"',
    [`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`, "public.merchant"],
  )
  if (!rows[0]?.knownTable) return // fresh database: apply everything

  const hasLedger = rows[0]?.ledger != null
  if (hasLedger && (await ledgerRowCount(pool)) > 0) return

  throw new Error(
    "This database already has application tables but no migration history " +
      "(it was probably created with `drizzle-kit push`). Run " +
      "`pnpm db:migrate --baseline` once to record the current migrations as " +
      "applied, or recreate the database and migrate from empty.",
  )
}

/** Record every migration in the journal as already applied, without running
 *  any SQL. The explicit one-time step for a `drizzle-kit push` database. */
async function baselineLedger(pool: Pool): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${MIGRATIONS_SCHEMA}`)
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`,
  )
  const { rows } = await pool.query<{ hash: string }>(
    `SELECT hash FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  )
  const existing = new Set(rows.map((row) => row.hash))

  let inserted = 0
  for (const entry of readJournal()) {
    const hash = migrationHash(
      readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf-8"),
    )
    if (existing.has(hash)) continue
    await pool.query(
      `INSERT INTO ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when],
    )
    inserted++
  }
  console.log(`Baselined ${inserted} migration(s) as already applied.`)
}

async function reconcileLegacyLedger(pool: Pool): Promise<void> {
  const regclass = `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`
  const { rows: exists } = await pool.query<{ reg: string | null }>(
    "SELECT to_regclass($1) AS reg",
    [regclass],
  )
  if (!exists[0]?.reg) return // fresh database: the migrator creates it

  const { rows } = await pool.query<{
    id: number
    hash: string
    created_at: number | null
  }>(
    `SELECT id, hash, created_at FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  )
  if (rows.length === 0) return

  const { updates, unmatched } = planLedgerReconciliation(
    rows,
    readJournal(),
    (tag) => {
      try {
        return migrationHash(
          readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), "utf-8"),
        )
      } catch {
        return null
      }
    },
  )

  for (const update of updates) {
    await pool.query(
      `UPDATE ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} SET hash = $1, created_at = $2 WHERE id = $3`,
      [update.hash, update.createdAt, update.id],
    )
  }
  if (updates.length > 0) {
    console.log(
      `Reconciled ${updates.length} legacy ledger row(s) to content hashes.`,
    )
  }

  // A row with no matching migration would otherwise pin the "last applied"
  // timestamp and silently skip newer migrations. Neutralize it.
  for (const row of unmatched) {
    console.warn(
      `Ledger row "${row.hash}" has no matching migration file — neutralizing its timestamp.`,
    )
    await pool.query(
      `UPDATE ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} SET created_at = 0 WHERE id = $1`,
      [row.id],
    )
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  // Hold the advisory lock on its own connection for the whole run: it is
  // database-wide, so a second migrator (another cluster service, a manual
  // run) blocks here instead of racing the DDL.
  const lock = new Client({ connectionString: process.env.DATABASE_URL })
  await lock.connect()

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  })

  try {
    await lock.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY])
    console.log("Acquired migration lock.")

    if (process.argv.includes("--baseline")) {
      await baselineLedger(pool)
    } else {
      await assertHistoryOrFresh(pool)
      await reconcileLegacyLedger(pool)

      const db = drizzle(pool)
      await migrate(db, {
        migrationsFolder: MIGRATIONS_DIR,
        migrationsSchema: MIGRATIONS_SCHEMA,
        migrationsTable: MIGRATIONS_TABLE,
      })
    }

    console.log("Migrations complete.")
  } finally {
    await lock
      .query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY])
      .catch(() => {})
    await lock.end()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
