import "dotenv/config"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Pool } from "pg"

const MIGRATIONS_DIR = "./drizzle/postgres"

function splitStatements(sql: string): string[] {
  return sql
    .replace(/--> statement-breakpoint/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function ensureMigrationTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)
}

function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  return pool
    .query<{ hash: string }>('SELECT "hash" FROM "__drizzle_migrations"')
    .then(({ rows }) => new Set(rows.map((r) => r.hash)))
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  })

  try {
    await ensureMigrationTable(pool)
    const applied = await getAppliedMigrations(pool)

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    for (const file of files) {
      if (applied.has(file)) {
        continue
      }

      console.log(`Applying migration: ${file}`)
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8")
      const statements = splitStatements(sql)

      for (let i = 0; i < statements.length; i++) {
        try {
          await pool.query(statements[i])
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`  [${i + 1}/${statements.length}] ${message}`)
          console.error(`  SQL: ${statements[i].slice(0, 300)}`)
          throw err
        }
      }

      await pool.query(
        'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
        [file, Date.now()],
      )
      console.log(`  ✓ Applied`)
    }

    console.log("Migrations complete.")
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
