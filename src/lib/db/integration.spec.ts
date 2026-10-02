// Real-Database integration invariants
//
// Almost every other spec in the repo mocks `@/lib/db`, so the guarantees that
// only Postgres can enforce — unique indexes backing the check-then-write
// Flows, the migration ledger being complete, the advisory lock
// That serialises concurrent runners, and the Asia/Dhaka business-day
// Timezone being available in the image — had no automated proof.
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
import { settledTotal } from "@/lib/balance-ledger"
import { applyPackageRule, pickTierForCount } from "@/lib/packages"
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

/** A delivery city — `pickup_location.cityId` is NOT NULL and restrict-FKed. */
async function insertCity(
  suffix: string,
  zoneId: string,
  warehouseId: string,
): Promise<string> {
  const id = `itest-city-${RUN}-${suffix}`
  await client.query(
    `INSERT INTO delivery_city (id, name, "zoneId", "warehouseId")
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [id, `itest city ${RUN}-${suffix}`, zoneId, warehouseId],
  )
  track("delivery_city", "id", id)
  return id
}

async function insertMerchant(suffix: string): Promise<string> {
  const id = `itest-mer-${RUN}-${suffix}`
  await client.query(
    `INSERT INTO merchant
       (id, "businessName", "ownerName", email, phone, address)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      id,
      `itest merchant ${RUN}-${suffix}`,
      "ITest Owner",
      `itest-${suffix}.${RUN}@example.com`,
      "+8801700000000",
      "n/a",
    ],
  )
  track("merchant", "id", id)
  return id
}

async function insertPickupLocation(
  merchantId: string,
  cityId: string,
): Promise<string> {
  const id = `itest-pkl-${RUN}-${randomUUID().slice(0, 8)}`
  await client.query(
    `INSERT INTO pickup_location (id, "merchantId", label, address, "cityId")
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [id, merchantId, "ITest pickup", "n/a", cityId],
  )
  track("pickup_location", "id", id)
  return id
}

interface TierSpec {
  orderCount: number
  ruleType: "FLAT" | "PERCENT_OFF"
  ruleValue: number
}

const DEFAULT_TIERS: TierSpec[] = [
  { orderCount: 10, ruleType: "FLAT", ruleValue: 10 },
]

async function insertTiers(
  packageId: string,
  tiers: readonly TierSpec[],
): Promise<string[]> {
  const ids: string[] = []
  for (const [sortOrder, tier] of tiers.entries()) {
    const tierId = `itest-tier-${RUN}-${randomUUID().slice(0, 8)}`
    await client.query(
      `INSERT INTO pricing_package_tier
         (id, "packageId", "orderCount", "sortOrder", "ruleType", "ruleValue")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tierId,
        packageId,
        tier.orderCount,
        sortOrder,
        tier.ruleType,
        tier.ruleValue,
      ],
    )
    track("pricing_package_tier", "id", tierId)
    ids.push(tierId)
  }
  return ids
}

/** An activated bundle for a merchant. */
async function insertMerchantPackage(
  merchantId: string,
  packageId: string,
  ordersUsed = 0,
): Promise<string> {
  const id = `itest-mp-${RUN}-${randomUUID().slice(0, 8)}`
  await client.query(
    `INSERT INTO merchant_package
       (id, "merchantId", "packageId", "ordersUsed", "isActive")
     VALUES ($1, $2, $3, $4, true)`,
    [id, merchantId, packageId, ordersUsed],
  )
  track("merchant_package", "id", id)
  return id
}

async function insertLedgerRow(
  merchantId: string,
  opts: {
    type: string
    amount: number
    status?: string
    paymentMethod?: string
    orderId?: string
  },
): Promise<string> {
  const id = `itest-tx-${RUN}-${randomUUID().slice(0, 8)}`
  await client.query(
    `INSERT INTO balance_transaction
       (id, "merchantId", type, amount, status, "paymentMethod", "orderId",
        "createdBy")
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'itest')`,
    [
      id,
      merchantId,
      opts.type,
      opts.amount,
      opts.status ?? "SETTLED",
      opts.paymentMethod ?? null,
      opts.orderId ?? null,
    ],
  )
  track("balance_transaction", "id", id)
  return id
}

async function insertBalanceRow(
  merchantId: string,
  balance: number,
  pendingBalance = 0,
): Promise<void> {
  await client.query(
    `INSERT INTO merchant_balance (id, "merchantId", balance, "pendingBalance")
     VALUES ($1, $2, $3, $4)`,
    [
      `itest-mb-${RUN}-${randomUUID().slice(0, 8)}`,
      merchantId,
      balance,
      pendingBalance,
    ],
  )
  track("merchant_balance", "merchantId", merchantId)
}

/** A pricing package, defaulting to a single FLAT 10 tier at 10 orders. */
async function insertPackage(
  suffix: string,
  tiers: readonly TierSpec[] = DEFAULT_TIERS,
): Promise<{ packageId: string; tierId: string }> {
  const packageId = `itest-pkg-${RUN}-${suffix}`
  await client.query(
    `INSERT INTO pricing_package (id, name, price) VALUES ($1, $2, 0)`,
    [packageId, `itest pkg ${RUN}-${suffix}`],
  )
  track("pricing_package", "id", packageId)

  const [tierId] = await insertTiers(packageId, tiers)
  return { packageId, tierId }
}

/** The minimum `order` row — carries the priced package snapshot. */
async function insertOrder(opts: {
  merchantId: string
  pickupLocationId: string
  warehouseId: string
  packageId?: string
  tierId?: string
  deliveryFee?: number
  codFee?: number
}): Promise<string> {
  const id = `itest-ord-${RUN}-${randomUUID().slice(0, 8)}`
  await client.query(
    `INSERT INTO "order"
       (id, "merchantId", "pickupLocationId", "recipientName",
        "recipientPhone", "deliveryAddress", "parcelWeightKg",
        "productCost", "deliveryFee", "codFee", "warehouseId",
        "packageId", "packageTierId", "packageRuleType", "packageRuleValue")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      opts.merchantId,
      opts.pickupLocationId,
      "ITest Recipient",
      "+8801700000001",
      "n/a street",
      1,
      100,
      opts.deliveryFee ?? 60,
      opts.codFee ?? 0,
      opts.warehouseId,
      opts.packageId ?? null,
      opts.tierId ?? null,
      opts.packageId ? "FLAT" : null,
      opts.packageId ? 10 : null,
    ],
  )
  track("order", "id", id)
  return id
}

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505"
/**
 * The SQLSTATEs Postgres raises when a foreign key refuses a delete.
 *
 * These are NOT interchangeable across server majors: PostgreSQL 18 added a
 * dedicated `23001` restrict_violation for `ON DELETE RESTRICT`, whereas
 * through 17 the identical statement against the identical schema reports the
 * plain `23503` foreign_key_violation (`ri_ReportViolation` gained the
 * restrict branch in 18). Both mean the same thing — "still referenced,
 * refused" — so a test that pins one code is really pinning the server
 * version. Accept either and let the catalog assertion carry the real weight.
 */
const FK_DELETE_REFUSAL = /^(?:23001|23503)$/
/** `pg_constraint.confdeltype` value for `ON DELETE RESTRICT`. */
const ON_DELETE_RESTRICT = "r"

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

// Packages / wallet (Phase 9) — the guarantees below only exist at the DB
// level: partial unique indexes that make "one active bundle", "one pending
// request" and "one pending top-up" race-safe, plus the FK behaviour that
// makes package deletion an archive rather than a data loss.
suite("packages & wallet partial constraints (Phase 9)", () => {
  it("allows only one active bundle per merchant", async () => {
    const merchant = await insertMerchant("bundle")
    const { packageId } = await insertPackage("bundle")

    const attach = async (isActive: boolean) => {
      const id = `itest-mp-${RUN}-${randomUUID().slice(0, 8)}`
      await client.query(
        `INSERT INTO merchant_package (id, "merchantId", "packageId", "isActive")
         VALUES ($1, $2, $3, $4)`,
        [id, merchant, packageId, isActive],
      )
      track("merchant_package", "id", id)
    }

    await attach(true)
    // A second *active* bundle collides with the partial unique index …
    await expect(attach(true)).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    })
    // … while an archived (exhausted / replaced) one is free to coexist.
    await attach(false)
  })

  it("allows only one pending purchase request per merchant", async () => {
    const merchant = await insertMerchant("request")
    const { packageId } = await insertPackage("request")

    const request = async (status: string) => {
      const id = `itest-ppr-${RUN}-${randomUUID().slice(0, 8)}`
      await client.query(
        `INSERT INTO package_purchase_request
           (id, "merchantId", "packageId", amount, status)
         VALUES ($1, $2, $3, 500, $4)`,
        [id, merchant, packageId, status],
      )
      track("package_purchase_request", "id", id)
    }

    await request("PENDING")
    await expect(request("PENDING")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    })
    // Already-reviewed requests sit outside the index, so history is unbounded.
    await request("APPROVED")
    await request("REJECTED")
  })

  it("allows only one pending top-up per merchant", async () => {
    const merchant = await insertMerchant("topup")

    const submit = async (type: string, status: string) => {
      const id = `itest-tx-${RUN}-${randomUUID().slice(0, 8)}`
      await client.query(
        `INSERT INTO balance_transaction
           (id, "merchantId", type, amount, status, "createdBy")
         VALUES ($1, $2, $3, 1000, $4, 'itest')`,
        [id, merchant, type, status],
      )
      track("balance_transaction", "id", id)
    }

    await submit("PAYMENT_PENDING", "PENDING")
    // The index is (merchantId) WHERE type='PAYMENT_PENDING' AND status='PENDING'.
    await expect(submit("PAYMENT_PENDING", "PENDING")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    })
    // A rejected submission and a confirmed one must not block a fresh attempt.
    await submit("PAYMENT_PENDING", "REJECTED")
    await submit("PAYMENT_CONFIRMED", "SETTLED")
  })

  it("refuses to delete a package a bundle or request still references", async () => {
    const merchant = await insertMerchant("restrict")
    const { packageId } = await insertPackage("restrict")

    const bundleId = `itest-mp-${RUN}-${randomUUID().slice(0, 8)}`
    await client.query(
      `INSERT INTO merchant_package (id, "merchantId", "packageId")
       VALUES ($1, $2, $3)`,
      [bundleId, merchant, packageId],
    )
    track("merchant_package", "id", bundleId)

    const requestId = `itest-ppr-${RUN}-${randomUUID().slice(0, 8)}`
    await client.query(
      `INSERT INTO package_purchase_request
         (id, "merchantId", "packageId", amount, status)
       VALUES ($1, $2, $3, 500, 'APPROVED')`,
      [requestId, merchant, packageId],
    )
    track("package_purchase_request", "id", requestId)

    // Assert the schema first, and read it from the catalog rather than inferring
    // it from an error code: both child FKs must be ON DELETE RESTRICT. `c`
    // (cascade) would silently destroy a merchant's bundle and purchase request,
    // which is exactly the data loss the archive-instead-of-delete rule exists to
    // prevent — and it would leave this test passing for the wrong reason.
    const { rows: fks } = await client.query<{ confdeltype: string }>(
      `SELECT confdeltype
         FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid = 'pricing_package'::regclass
          AND conrelid = ANY (ARRAY['merchant_package', 'package_purchase_request']::regclass[])`,
    )
    expect(fks.map((fk) => fk.confdeltype)).toEqual([
      ON_DELETE_RESTRICT,
      ON_DELETE_RESTRICT,
    ])

    // This is the "archive instead of delete" rule: the restrict FKs force the
    // soft-delete path in the API rather than cascading bundles/requests away.
    await expect(
      client.query(`DELETE FROM pricing_package WHERE id = $1`, [packageId]),
    ).rejects.toMatchObject({ code: expect.stringMatching(FK_DELETE_REFUSAL) })

    // A refusal must leave the referencing rows intact — proof the FK refused
    // rather than cascading, and that afterEach still has rows to clean up.
    const { rows: survivors } = await client.query<{ count: string }>(
      `SELECT (
         SELECT count(*) FROM merchant_package WHERE id = $1
       ) + (
         SELECT count(*) FROM package_purchase_request WHERE id = $2
       ) AS count`,
      [bundleId, requestId],
    )
    expect(survivors[0].count).toBe("2")
  })

  it("nulls the order snapshot FKs when the package goes away", async () => {
    const zone = await insertZone("snapshot")
    const warehouse = await insertWarehouse("snapshot")
    const city = await insertCity("snapshot", zone, warehouse)
    const merchant = await insertMerchant("snapshot")
    const pickupLocation = await insertPickupLocation(merchant, city)
    const { packageId, tierId } = await insertPackage("snapshot")
    const orderId = await insertOrder({
      merchantId: merchant,
      pickupLocationId: pickupLocation,
      warehouseId: warehouse,
      packageId,
      tierId,
    })

    await client.query(`DELETE FROM pricing_package WHERE id = $1`, [packageId])

    const { rows } = await client.query<{
      packageId: string | null
      packageTierId: string | null
      packageRuleType: string | null
      packageRuleValue: number | null
    }>(
      `SELECT "packageId", "packageTierId", "packageRuleType", "packageRuleValue"
       FROM "order" WHERE id = $1`,
      [orderId],
    )
    // The FKs detach (set null) instead of blocking the delete …
    expect(rows[0].packageId).toBeNull()
    expect(rows[0].packageTierId).toBeNull()
    // … but the priced snapshot itself survives: history keeps its discount.
    expect(rows[0].packageRuleType).toBe("FLAT")
    expect(rows[0].packageRuleValue).toBe(10)
  })
})

// The one guarantee a unit test cannot make: that `SELECT … FOR UPDATE` on the
// bundle row really does serialise two creates that straddle a tier boundary.
// The integration suite cannot import `@/lib/db` (it opens pools at import
// time), so the reserve is replayed as raw SQL — src/lib/order-pricing.spec.ts
// separately pins that the shipped code issues exactly this statement.
suite("package tier lock (Phase 9 DoD)", () => {
  /** The zone fee each reserved order would be priced from. */
  const ZONE_FEE = 100

  it("serialises two creates across a tier boundary", async () => {
    const merchantId = await insertMerchant("lock")
    const { packageId } = await insertPackage("lock", [
      { orderCount: 10, ruleType: "PERCENT_OFF", ruleValue: 10 },
      { orderCount: 100, ruleType: "FLAT", ruleValue: 5 },
    ])
    // Pinned one order short of the deeper tier.
    const bundleId = await insertMerchantPackage(merchantId, packageId, 99)

    const first = new Client({ connectionString })
    const second = new Client({ connectionString })
    await first.connect()
    await second.connect()

    /** One order create's worth of work inside its own transaction. */
    const reserve = async (
      conn: Client,
      holdMs: number,
    ): Promise<{ ordersUsed: number; fee: number; tierId: string | null }> => {
      await conn.query("BEGIN")
      try {
        const { rows } = await conn.query<{ ordersUsed: number }>(
          `SELECT "ordersUsed" FROM merchant_package
           WHERE "merchantId" = $1 AND "isActive" = true
           FOR UPDATE`,
          [merchantId],
        )
        const ordersUsed = rows[0].ordersUsed
        const { rows: tierRows } = await conn.query<{
          id: string
          orderCount: number
          sortOrder: number
          ruleType: "FLAT" | "PERCENT_OFF"
          ruleValue: number
        }>(
          `SELECT id, "orderCount", "sortOrder", "ruleType", "ruleValue"
           FROM pricing_package_tier WHERE "packageId" = $1
           ORDER BY "orderCount"`,
          [packageId],
        )
        const tier = pickTierForCount(tierRows, ordersUsed)
        await conn.query(
          `UPDATE merchant_package
           SET "ordersUsed" = "ordersUsed" + 1, "updatedAt" = now()
           WHERE id = $1`,
          [bundleId],
        )
        // Hold the lock open so the second create is guaranteed to queue behind.
        await new Promise((r) => setTimeout(r, holdMs))
        await conn.query("COMMIT")
        return {
          ordersUsed,
          fee: applyPackageRule(ZONE_FEE, tier),
          tierId: tier?.id ?? null,
        }
      } catch (err) {
        await conn.query("ROLLBACK")
        throw err
      }
    }

    try {
      let secondResolved = false
      const a = reserve(first, 800)
      // Let the first transaction take the lock, then queue the second behind it.
      await new Promise((r) => setTimeout(r, 150))
      const b = reserve(second, 0).then((result) => {
        secondResolved = true
        return result
      })

      await new Promise((r) => setTimeout(r, 300))
      // Still inside the first transaction's lock window: the second create
      // has not been able to read `ordersUsed` at all.
      expect(secondResolved).toBe(false)

      const [firstResult, secondResult] = await Promise.all([a, b])

      // The loser of the race re-reads the committed value, so the two creates
      // land on different sides of the boundary instead of double-spending it.
      expect(firstResult.ordersUsed).toBe(99)
      expect(firstResult.fee).toBe(90) // 10% off the 100 Tk zone fee
      expect(secondResult.ordersUsed).toBe(100)
      expect(secondResult.fee).toBe(5) // the flat tier unlocked at 100
      expect(secondResult.tierId).not.toBe(firstResult.tierId)

      // Quota advanced exactly twice — the lock made both bumps visible.
      const { rows: bundleRows } = await client.query<{ ordersUsed: number }>(
        `SELECT "ordersUsed" FROM merchant_package WHERE id = $1`,
        [bundleId],
      )
      expect(bundleRows[0].ordersUsed).toBe(101)
    } finally {
      await first.end()
      await second.end()
    }
  })
})

suite("ledger reconciliation with a bundle (Phase 9 DoD)", () => {
  it("balance still equals the sum of settled rows", async () => {
    const zone = await insertZone("ledger")
    const warehouse = await insertWarehouse("ledger")
    const city = await insertCity("ledger", zone, warehouse)
    const merchantId = await insertMerchant("ledger")
    const pickupLocationId = await insertPickupLocation(merchantId, city)
    const { packageId, tierId } = await insertPackage("ledger")
    await insertMerchantPackage(merchantId, packageId, 10)

    // A bundle-priced order: FLAT 10 delivery + 2 COD = a 12 Tk charge.
    const orderId = await insertOrder({
      merchantId,
      pickupLocationId,
      warehouseId: warehouse,
      packageId,
      tierId,
      deliveryFee: 10,
      codFee: 2,
    })
    await insertLedgerRow(merchantId, {
      type: "ORDER_CHARGE",
      amount: 12,
      orderId,
    })
    // The prepaid bundle itself: a confirmed payment, tagged as a package.
    await insertLedgerRow(merchantId, {
      type: "PAYMENT_CONFIRMED",
      amount: -500,
      paymentMethod: "PACKAGE",
    })
    // A top-up still awaiting an admin must not touch the balance …
    await insertLedgerRow(merchantId, {
      type: "PAYMENT_PENDING",
      amount: -300,
      status: "PENDING",
    })
    // … it parks in `pendingBalance` instead.
    await insertBalanceRow(merchantId, -488, 300)

    const { rows } = await client.query<{ amount: string; status: string }>(
      `SELECT amount, status FROM balance_transaction
       WHERE "merchantId" = $1 ORDER BY "createdAt", id`,
      [merchantId],
    )
    // `numeric` comes back as a string over the wire.
    const ledger = rows.map((r) => ({
      amount: Number(r.amount),
      status: r.status,
    }))

    const { rows: balanceRows } = await client.query<{
      balance: string
      pendingBalance: string
    }>(
      `SELECT balance, "pendingBalance" FROM merchant_balance
       WHERE "merchantId" = $1`,
      [merchantId],
    )
    const balance = Number(balanceRows[0].balance)

    // The invariant, computed by the same helper the balance route uses.
    expect(settledTotal(ledger)).toBe(balance)
    // 12 charged − 500 credited = 488 Tk in the merchant's favour.
    expect(balance).toBe(-488)
    // The pending top-up is held separately, never folded into the balance.
    expect(Number(balanceRows[0].pendingBalance)).toBe(300)
  })

  it("keeps the invariant when the bundle is refunded on a cancel", async () => {
    const zone = await insertZone("refund")
    const warehouse = await insertWarehouse("refund")
    const city = await insertCity("refund", zone, warehouse)
    const merchantId = await insertMerchant("refund")
    const pickupLocationId = await insertPickupLocation(merchantId, city)
    const { packageId, tierId } = await insertPackage("refund")
    await insertMerchantPackage(merchantId, packageId, 10)

    const orderId = await insertOrder({
      merchantId,
      pickupLocationId,
      warehouseId: warehouse,
      packageId,
      tierId,
      deliveryFee: 10,
      codFee: 2,
    })
    await insertLedgerRow(merchantId, {
      type: "ORDER_CHARGE",
      amount: 12,
      orderId,
    })
    // Cancelling writes the mirror of that charge, per balance-ledger.ts.
    await insertLedgerRow(merchantId, {
      type: "ORDER_CHARGE_REVERSAL",
      amount: -12,
      orderId,
    })
    await insertLedgerRow(merchantId, {
      type: "ORDER_CANCELLATION",
      amount: 3,
      orderId,
    })
    await insertBalanceRow(merchantId, 3)

    const { rows } = await client.query<{ amount: string; status: string }>(
      `SELECT amount, status FROM balance_transaction
       WHERE "merchantId" = $1`,
      [merchantId],
    )
    const ledger = rows.map((r) => ({
      amount: Number(r.amount),
      status: r.status,
    }))

    // Fully reversed apart from the cancellation fee the platform keeps.
    expect(settledTotal(ledger)).toBe(3)
  })
})

// -----------------------------------------------------------------------------
// Invariants added by the 0003 migration: the `cron_run` heartbeat table
// And the indexes. Every other spec mocks the
// driver, so only this suite can prove the partial predicates and the upsert
// semantics actually exist in Postgres.
// -----------------------------------------------------------------------------

suite("cron heartbeat + new indexes (ROADMAP R0.8, R3.8, R3.9)", () => {
  it("upserts one row per job instead of one per run", async () => {
    const job = `itest-cron-${RUN}`
    track("cron_run", "job", job)

    await client.query(
      `INSERT INTO cron_run (job, "lastRanAt", "updatedAt", "ok")
       VALUES ($1, now(), now(), true)`,
      [job],
    )

    // The whole design: `drain-email-outbox` fires every minute, so a row per
    // run would grow without bound. Advance the heartbeat and expect one row.
    await client.query(
      `INSERT INTO cron_run (job, "lastRanAt", "updatedAt", "ok")
       VALUES ($1, now() + interval '1 hour', now(), true)
       ON CONFLICT (job) DO UPDATE
         SET "lastRanAt" = EXCLUDED."lastRanAt",
             "updatedAt" = EXCLUDED."updatedAt"`,
      [job],
    )

    const { rows } = await client.query<{ n: number; last: string | null }>(
      `SELECT count(*)::int AS n, max("lastRanAt") AS last
         FROM cron_run WHERE job = $1`,
      [job],
    )
    expect(rows[0].n).toBe(1)
    expect(rows[0].last).toBeTruthy()
    // The second write moved the heartbeat forward, proving DO UPDATE ran.
    expect(Date.parse(rows[0].last as string)).toBeGreaterThan(Date.now())
  })

  it("has every index the migration promised, with the right predicates", async () => {
    const names = [
      "cron_run_last_ran_at_idx",
      "user_created_at_idx",
      "user_activation_token_idx",
      "merchant_email_verification_token_idx",
      "order_package_id_idx",
      "order_package_tier_id_idx",
    ]
    const { rows } = await client.query<{
      indexname: string
      indexdef: string
    }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [names],
    )
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]))
    for (const name of names) {
      expect(byName.has(name), `missing index ${name}`).toBe(true)
    }

    // The two token lookups are public endpoints that scan by value, so they
    // are partial: activated accounts hold NULL and cost nothing to index.
    expect(byName.get("user_activation_token_idx")).toMatch(/WHERE/i)
    expect(byName.get("merchant_email_verification_token_idx")).toMatch(
      /WHERE/i,
    )

    // …while the FK and sort indexes must cover every row, or a delete or a
    // page turn would fall back to scanning the table.
    for (const name of [
      "order_package_id_idx",
      "order_package_tier_id_idx",
      "user_created_at_idx",
      "cron_run_last_ran_at_idx",
    ]) {
      expect(byName.get(name), name).not.toMatch(/WHERE/i)
    }
  })
})
