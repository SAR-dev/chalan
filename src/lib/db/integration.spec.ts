// Real-Database integration invariants (ROADMAP P3)
//
// Almost every other spec in the repo mocks `@/lib/db`, so the guarantees that
// only Postgres can enforce — unique indexes backing the check-then-write
// flows (P1.1), the migration ledger being complete (P1.2), the advisory lock
// that serialises concurrent runners (P1.2), and the Asia/Dhaka business-day
// timezone being available in the image (P1.3) — had no automated proof.
//
// This suite talks to a real database and is therefore opt-in: it is skipped
// unless INTEGRATION_DATABASE_URL points at a migrated database.
//
//   pnpm db:migrate
//   $env:INTEGRATION_DATABASE_URL="postgres://…"; pnpm test:integration
//
// The `integration` CI job does exactly that against a throwaway Postgres. It
// writes only rows it creates, all tagged with a per-run suffix and removed
// afterwards, so it is safe to point at a seeded dev database.

import { createHash, randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Client } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { MIGRATIONS_TABLE, readJournal } from "./migration-ledger"

const connectionString = process.env.INTEGRATION_DATABASE_URL
// Every fixture row carries this suffix so cleanup can never touch real data.
const RUN = randomUUID().slice(0, 8)

const suite = connectionString ? describe : describe.skip

let client: Client
const created: { table: string; column: string; value: string }[] = []

/** Register a row for cleanup. */
function track(table: string, column: string, value: string) {
  created.push({ table, column, value })
}

async function insertZone(suffix: string): Promise<string> {
  const id = `itest-zone-${RUN}-${suffix}`
  await client.query(
    `INSERT INTO delivery_zone (id, name) VALUES ($1, $2) RETURNING id`,
    [id, `itest zone ${RUN} ${suffix}`],
  )
  track("delivery_zone", "id", id)
  return id
}

async function insertWarehouse(suffix: string): Promise<string> {
  const id = `itest-wh-${RUN}-${suffix}`
  await client.query(
    `INSERT INTO warehouse (id, name, address, city) VALUES ($1, $2, $3, $4) RETURNING id`,
    [id, `itest warehouse ${RUN} ${suffix}`, "n/a", "n/a"],
  )
  track("warehouse", "id", id)
  return id
}

async function insertRider(email: string, suffix: string): Promise<string> {
  const id = `itest-rider-${RUN}-${suffix}`
  // A fresh warehouse per call: it is registered for cleanup with this test, so
  // it must not be shared across tests (afterEach deletes what it tracked).
  const warehouse = await insertWarehouse(`rider-${suffix}`)
  await client.query(
    `INSERT INTO rider (id, name, email, phone, zone, "warehouseId")
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [id, `itest rider ${suffix}`, email, "+8801700000000", "itest", warehouse],
  )
  track("rider", "id", id)
  return id
}

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505"

beforeAll(async () => {
  if (!connectionString) return
  client = new Client({ connectionString })
  await client.connect()
})

afterAll(async () => {
  await client?.end()
})

afterEach(async () => {
  if (!client) return
  // Delete in reverse insertion order so FKs never block the cleanup.
  for (const row of created.reverse()) {
    await client.query(
      `DELETE FROM "${row.table}" WHERE "${row.column}" = $1`,
      [row.value],
    )
  }
  created.length = 0
})

suite("migrations (P1.2)", () => {
  it("applies every journal entry to the ledger", async () => {
    const journal = readJournal()
    expect(journal.length).toBeGreaterThan(0)

    const { rows } = await client.query<{ hash: string }>(
      `SELECT hash FROM ${MIGRATIONS_TABLE} ORDER BY id`,
    )
    // The ledger stores content hashes, so compare against the journal by count
    // plus per-file hash presence.
    expect(rows).toHaveLength(journal.length)

    for (const entry of journal) {
      const file = join(
        process.cwd(),
        "drizzle",
        "postgres",
        `${entry.tag}.sql`,
      )
      const hash = createHash("sha256").update(readFileSync(file)).digest("hex")
      expect(rows.map((r) => r.hash)).toContain(hash)
    }
  })

  it("has no unapplied .sql file missing from the journal", () => {
    const files = readdirSync(join(process.cwd(), "drizzle", "postgres"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort()
    const tags = readJournal()
      .map((e) => e.tag)
      .sort()
    expect(files).toEqual(tags)
  })
})

suite("unique indexes (P1.1)", () => {
  it("rejects a second pricing row for the same zone pair", async () => {
    const from = await insertZone("from")
    const to = await insertZone("to")

    const insert = async () => {
      const id = `itest-zp-${RUN}-${randomUUID().slice(0, 8)}`
      await client.query(
        `INSERT INTO zone_pricing (id, "fromZoneId", "toZoneId", "baseRate")
         VALUES ($1, $2, $3, 0)`,
        [id, from, to],
      )
      track("zone_pricing", "id", id)
    }

    await insert()
    await expect(insert()).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    })
  })

  it("rejects a duplicate rider email regardless of case", async () => {
    const email = `ITest.Rider.${RUN}@Example.com`
    await insertRider(email, "a")
    await expect(insertRider(email.toUpperCase(), "b")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    })
  })

  it("allows warehouse-created riders that share the blank email", async () => {
    // The partial index excludes `email = ''`, otherwise every warehouse-made
    // rider without an email would collide with the others.
    await insertRider("", "blank-1")
    await expect(insertRider("", "blank-2")).resolves.toBeDefined()
  })
})

suite("advisory lock (P1.2)", () => {
  it("serialises two runners on the same key", async () => {
    const key = "8462384756930276"
    const other = new Client({ connectionString })
    await other.connect()
    try {
      await client.query("SELECT pg_advisory_lock($1)", [key])
      // The second connection must block until the first releases.
      let acquired = false
      const pending = other
        .query("SELECT pg_advisory_lock($1)", [key])
        .then(() => {
          acquired = true
        })

      await new Promise((r) => setTimeout(r, 200))
      expect(acquired).toBe(false)

      await client.query("SELECT pg_advisory_unlock($1)", [key])
      await pending
      expect(acquired).toBe(true)
      await other.query("SELECT pg_advisory_unlock($1)", [key])
    } finally {
      await other.end()
    }
  })
})

suite("business timezone (P1.3)", () => {
  it("has Asia/Dhaka available and rolls the business day at +06:00", async () => {
    const { rows } = await client.query<{ dhaka: string; utc: string }>(
      `SELECT
         to_char('2025-01-01 18:30:00+00' AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS utc,
         to_char('2025-01-01 18:30:00+00' AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS dhaka`,
    )
    expect(rows[0].utc).toBe("2025-01-01")
    expect(rows[0].dhaka).toBe("2025-01-02")
  })

  it("applies Asia/Dhaka to a session when asked", async () => {
    await client.query("SET TIME ZONE 'Asia/Dhaka'")
    try {
      const { rows } = await client.query<{ now: string }>(
        `SELECT to_char(now() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS now`,
      )
      expect(rows[0].now).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const { rows: tzRows } = await client.query<{ tz: string }>(
        "SELECT current_setting('TimeZone') AS tz",
      )
      expect(tzRows[0].tz).toBe("Asia/Dhaka")
    } finally {
      await client.query("SET TIME ZONE 'UTC'")
    }
  })
})
