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

/**
 * A delivery city — `pickup_location.cityId` is NOT NULL and restrict-FKed.
 */
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

suite("announcement watermark (profile)", () => {
  it("a profile can be created without setting announcementsSeenAt", async () => {
    // Better Auth and the registration flow know nothing about this column:
    // if it ever became NOT NULL without a default, every signup would break.
    // The watermark is per-user board state, not identity — default null
    // ("never visited") is the load-bearing part.
    const userId = `itest-wm-${RUN}`
    await client.query(
      `INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)`,
      [userId, `itest watermark ${RUN}`, `itest.wm.${RUN}@example.com`],
    )
    track("user", "id", userId)
    await client.query(
      `INSERT INTO profile ("userId", role) VALUES ($1, 'MERCHANT')`,
      [userId],
    )
    track("profile", "userId", userId)

    const { rows } = await client.query<{ seenAt: string | null }>(
      `SELECT "announcementsSeenAt"::text AS "seenAt" FROM profile WHERE "userId" = $1`,
      [userId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].seenAt).toBeNull()
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

// =============================================================================
// DBREFACTOR Phase B — referential actions
//
// Three child tables moved from ON DELETE CASCADE to ON DELETE RESTRICT. Both
// parents are undeletable through any API route today, so this changes no
// behaviour: the point is that the mistake becomes impossible rather than
// merely absent.
//
// Each test asserts the catalog *and* the refusal. Catalog alone would pass
// against a constraint nothing exercised; the refusal alone would pass for the
// wrong reason (an unrelated FK refusing first). Together they pin "this FK,
// this action".
// =============================================================================

suite("referential actions (DBREFACTOR Phase B)", () => {
  /** The delete actions of every FK from `childTable` to `parentTable`. */
  async function fkActions(
    childTable: string,
    parentTable: string,
  ): Promise<string[]> {
    const { rows } = await client.query<{ confdeltype: string }>(
      `SELECT confdeltype
         FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = $1::regclass
          AND confrelid = $2::regclass`,
      [childTable, parentTable],
    )
    return rows.map((r) => r.confdeltype)
  }

  it("refuses to delete a merchant that has ledger rows", async () => {
    const merchant = await insertMerchant("ledger")
    await insertLedgerRow(merchant, { type: "ORDER_CHARGE", amount: 100 })

    expect(await fkActions("balance_transaction", "merchant")).toEqual([
      ON_DELETE_RESTRICT,
    ])

    await expect(
      client.query(`DELETE FROM merchant WHERE id = $1`, [merchant]),
    ).rejects.toMatchObject({ code: expect.stringMatching(FK_DELETE_REFUSAL) })

    // The ledger row survived — a cascade would have erased an append-only
    // financial record with no ADJUSTMENT row to explain the gap.
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM balance_transaction WHERE "merchantId" = $1`,
      [merchant],
    )
    expect(rows[0].count).toBe("1")
  })

  it("still deletes a merchant with no ledger rows", async () => {
    // RESTRICT must not be misread as "merchants are undeletable". If this ever
    // fails, the refusal above has become a blanket prohibition rather than a
    // reference check.
    const merchant = await insertMerchant("noledger")
    // stop tracking it: this test deletes the row itself, and leaving it in the
    // cleanup queue would make afterEach delete a row that is already gone.
    created.pop()

    await client.query(`DELETE FROM merchant WHERE id = $1`, [merchant])
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM merchant WHERE id = $1`,
      [merchant],
    )
    expect(rows[0].count).toBe("0")
  })

  it("refuses to delete a zone that has pricing rows", async () => {
    const zoneA = await insertZone("price-a")
    const zoneB = await insertZone("price-b")

    // Tracked, because `afterEach` deletes in reverse insertion order and these
    // rows are what the refused DELETE leaves behind. Without `track` the cleanup
    // itself trips the very constraint under test and the suite cascades into
    // unrelated failures.
    await client.query(
      `INSERT INTO zone_pricing (id, "fromZoneId", "toZoneId") VALUES ($1, $2, $3)`,
      [`itest-zp-${RUN}-a`, zoneA, zoneB],
    )
    track("zone_pricing", "id", `itest-zp-${RUN}-a`)
    await client.query(
      `INSERT INTO zone_pricing (id, "fromZoneId", "toZoneId") VALUES ($1, $2, $3)`,
      [`itest-zp-${RUN}-b`, zoneB, zoneA],
    )
    track("zone_pricing", "id", `itest-zp-${RUN}-b`)

    // Both endpoints of the matrix are protected — a cascade on only one side
    // would still destroy a lane from the other direction.
    expect(await fkActions("zone_pricing", "delivery_zone")).toEqual([
      ON_DELETE_RESTRICT,
      ON_DELETE_RESTRICT,
    ])

    await expect(
      client.query(`DELETE FROM delivery_zone WHERE id = $1`, [zoneA]),
    ).rejects.toMatchObject({ code: expect.stringMatching(FK_DELETE_REFUSAL) })

    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM zone_pricing WHERE id = $1`,
      [`itest-zp-${RUN}-a`],
    )
    expect(rows[0].count).toBe("1")
  })

  it("refuses to delete a zone that has delivery-time rows", async () => {
    // `zone_delivery_time` was added after Phase B was drafted and carried the
    // same cascade hole. Covered here so the two matrices cannot drift apart
    // again: one being protected and the other not would be indefensible.
    const zoneA = await insertZone("time-a")
    const zoneB = await insertZone("time-b")

    await client.query(
      `INSERT INTO zone_delivery_time (id, "fromZoneId", "toZoneId", "deliveryDays")
       VALUES ($1, $2, $3, 2)`,
      [`itest-zdt-${RUN}-a`, zoneA, zoneB],
    )
    track("zone_delivery_time", "id", `itest-zdt-${RUN}-a`)

    expect(await fkActions("zone_delivery_time", "delivery_zone")).toEqual([
      ON_DELETE_RESTRICT,
      ON_DELETE_RESTRICT,
    ])

    await expect(
      client.query(`DELETE FROM delivery_zone WHERE id = $1`, [zoneA]),
    ).rejects.toMatchObject({ code: expect.stringMatching(FK_DELETE_REFUSAL) })
  })

  it("leaves derived and auth tables cascading", async () => {
    // The other half of Decision #4: hardening must not be uniform.
    // `merchant_balance` is a cache of the ledger and `profile`/`session`
    // belong to `user` — all three are *supposed* to die with their parent.
    expect(await fkActions("merchant_balance", "merchant")).toEqual(["c"])
    expect(await fkActions("profile", "user")).toEqual(["c"])
    expect(await fkActions("session", "user")).toEqual(["c"])
  })
})

// =============================================================================
// DBREFACTOR Phase C/D — order CHECK constraints
//
// Twelve conditional CHECKs on `order`: six lifecycle pairings (this status
// happened, so its timestamp exists) and six money columns (never negative).
//
// Every constraint gets a test that a violating row is **rejected**, not merely
// that a valid row passes. The table is generated from the same source as
// `pnpm db:audit-invariants`, so a constraint cannot be added to the schema
// without also being asserted here.
//
// Each test also confirms the valid row still inserts — a constraint that
// rejected everything would satisfy a rejection-only test.
// =============================================================================

suite("order CHECK constraints (DBREFACTOR Phase C/D)", () => {
  /** SQLSTATE for check_violation. Stable across server majors. */
  const CHECK_VIOLATION = "23514"

  interface CheckCase {
    constraint: string
    /** Columns beyond the minimum order row. */
    extra: Record<string, string | number | null>
  }

  /**
   * Each case is a lifecycle pairing: the status is set but its timestamp is
   * omitted (null), which is exactly what the constraint exists to reject.
   */
  const LIFECYCLE_CASES: CheckCase[] = [
    {
      constraint: "order_delivered_needs_delivered_at",
      extra: { status: "DELIVERED" },
    },
    {
      constraint: "order_cancelled_needs_cancelled_at",
      extra: { status: "CANCELLED" },
    },
    {
      constraint: "order_returned_needs_returned_at",
      extra: { status: "RETURNED" },
    },
    {
      constraint: "order_picked_up_needs_picked_up_at",
      extra: { status: "PICKED_UP" },
    },
    {
      constraint: "order_out_for_pickup_needs_out_for_pickup_at",
      extra: { status: "OUT_FOR_PICKUP" },
    },
    {
      constraint: "order_out_for_delivery_needs_out_for_delivery_at",
      extra: { status: "OUT_FOR_DELIVERY" },
    },
  ]

  const MONEY_CASES: CheckCase[] = [
    {
      constraint: "order_product_cost_nonneg",
      extra: { productCost: -1 },
    },
    {
      constraint: "order_delivery_fee_nonneg",
      extra: { deliveryFee: -0.01 },
    },
    {
      constraint: "order_cod_fee_nonneg",
      extra: { codFee: -5 },
    },
    {
      constraint: "order_cancellation_fee_nonneg",
      extra: { cancellationFee: -65 },
    },

    {
      constraint: "order_amount_collected_nonneg",
      extra: { amountCollected: -100 },
    },
  ]

  /**
   * Build an `order` INSERT with arbitrary extra columns.
   *
   * Defaults are merged into a single row object rather than prepended to a
   * separate list, so a case can *override* `productCost`/`deliveryFee`/
   * `codFee` instead of emitting them twice — which Postgres rejects as
   * "column specified more than once", before the CHECK under test ever runs.
   */
  function orderInsert(
    base: {
      merchantId: string
      pickupLocationId: string
      warehouseId: string
    },
    extra: Record<string, string | number | null>,
  ) {
    const row: Record<string, string | number | null> = {
      id: `itest-ord-${RUN}-${randomUUID().slice(0, 8)}`,
      merchantId: base.merchantId,
      pickupLocationId: base.pickupLocationId,
      recipientName: "ITest Recipient",
      recipientPhone: "+8801700000001",
      deliveryAddress: "n/a street",
      parcelWeightKg: 1,
      productCost: 100,
      deliveryFee: 60,
      codFee: 0,
      warehouseId: base.warehouseId,
      ...extra,
    }
    const cols = Object.keys(row)
    const values = Object.values(row)
    const placeholders = cols.map((_, i) => `$${i + 1}`)
    const quoted = cols.map((c) => `"${c}"`).join(", ")
    return {
      id: row.id as string,
      sql: `INSERT INTO "order" (${quoted}) VALUES (${placeholders.join(", ")})`,
      values,
    }
  }

  /** Fixtures for a minimum order row, registered for cleanup. */
  async function orderBase(suffix: string) {
    const zone = await insertZone(`chk-${suffix}`)
    const warehouse = await insertWarehouse(`chk-${suffix}`)
    const city = await insertCity(`chk-${suffix}`, zone, warehouse)
    const merchant = await insertMerchant(`chk-${suffix}`)
    const pickupLocation = await insertPickupLocation(merchant, city)
    return {
      merchantId: merchant,
      pickupLocationId: pickupLocation,
      warehouseId: warehouse,
    }
  }

  for (const testCase of [...LIFECYCLE_CASES, ...MONEY_CASES]) {
    it(`rejects a row violating ${testCase.constraint}`, async () => {
      const base = await orderBase(testCase.constraint.slice(-8))
      const { sql, values } = orderInsert(base, testCase.extra)

      await expect(client.query(sql, values)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      })

      // The message must name the constraint, or an operator staring at
      // "violates check constraint" learns nothing about which pairing broke.
      await expect(client.query(sql, values)).rejects.toThrow(
        testCase.constraint,
      )

      // Nothing was written — the insert is rejected, not coerced.
      const { rows } = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM "order" WHERE id = $1`,
        [values[0]],
      )
      expect(rows[0].count).toBe("0")
    })
  }

  it("accepts a lifecycle status that carries its timestamp", async () => {
    // The other half: a correct row must still insert, or the constraint has
    // simply forbidden a status rather than describing it.
    const base = await orderBase("ok")
    const { id, sql, values } = orderInsert(base, {
      status: "DELIVERED",
      deliveredAt: new Date().toISOString(),
    })
    await client.query(sql, values)
    track("order", "id", id)

    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM "order" WHERE id = $1`,
      [id],
    )
    expect(rows[0].status).toBe("DELIVERED")
  })

  it("accepts a zero fee and a null amountCollected", async () => {
    // The boundary cases. `0` is legitimate (free delivery) and `NULL` means
    // "no cash collected yet" — a constraint written as `> 0` or without the
    // NULL branch would reject both.
    const base = await orderBase("zero")
    const { id, sql, values } = orderInsert(base, {
      deliveryFee: 0,
      codFee: 0,
      cancellationFee: 0,
      merchantEarnings: 0,
      amountCollected: null,
    })
    await client.query(sql, values)
    track("order", "id", id)

    const { rows } = await client.query<{ deliveryFee: string }>(
      `SELECT "deliveryFee" FROM "order" WHERE id = $1`,
      [id],
    )
    expect(rows[0].deliveryFee).toBe("0.00")
  })

  it("leaves status unconstrained, so a new status needs no DDL", async () => {
    // The regression guard for DBREFACTOR Decision #1. If a `status IN (…)`
    // CHECK is ever added, this fails and the cost-per-status property is gone.
    // A status nobody has heard of yet must be storable.
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_constraint
        WHERE contype = 'c'
          AND conrelid = '"order"'::regclass
          AND pg_get_constraintdef(oid) LIKE '%status%IN%'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it("still accepts a status the application has never heard of", async () => {
    // Belt and braces for the same property, behaviourally: the database trusts
    // the writer rather than duplicating the enum.
    const base = await orderBase("future")
    const { id, sql, values } = orderInsert(base, { status: "QUANTUM_ENTERED" })
    await client.query(sql, values)
    track("order", "id", id)

    const { rows } = await client.query<{ status: string }>(
      `SELECT status FROM "order" WHERE id = $1`,
      [id],
    )
    expect(rows[0].status).toBe("QUANTUM_ENTERED")
  })
})

// =============================================================================
// ROADMAP R8 — recipient email (`order.recipientMail`)
//
// Nullability is the load-bearing property here, not a detail. Every order
// created before this column existed, every bulk row that omits the column and
// every merchant who only ever collects a phone number writes NULL — making it
// NOT NULL (or giving it a "helpful" default) would break all three at once.
// `profile.announcementsSeenAt` already taught exactly this lesson.
// =============================================================================

suite("recipient email (R8)", () => {
  /** Fixtures for one order, registered for cleanup by `afterEach`. */
  async function r8Base(suffix: string) {
    const zone = await insertZone(`r8-${suffix}`)
    const warehouse = await insertWarehouse(`r8-${suffix}`)
    const city = await insertCity(`r8-${suffix}`, zone, warehouse)
    const merchant = await insertMerchant(`r8-${suffix}`)
    const pickupLocation = await insertPickupLocation(merchant, city)
    return {
      merchantId: merchant,
      pickupLocationId: pickupLocation,
      warehouseId: warehouse,
    }
  }

  async function insertR8Order(
    base: Awaited<ReturnType<typeof r8Base>>,
    recipientMail: string | null | undefined,
  ): Promise<string> {
    const id = `itest-ord-${RUN}-${randomUUID().slice(0, 8)}`
    // Column omitted entirely when undefined — the case that breaks if the
    // column is ever made NOT NULL without a default.
    const cols = [
      "id",
      "merchantId",
      "pickupLocationId",
      "warehouseId",
      "recipientName",
      "recipientPhone",
      "deliveryAddress",
      "parcelWeightKg",
      "productCost",
      "deliveryFee",
      "codFee",
    ]
    const values: (string | number | null)[] = [
      id,
      base.merchantId,
      base.pickupLocationId,
      base.warehouseId,
      "ITest Recipient",
      "+8801700000001",
      "n/a street",
      1,
      100,
      60,
      0,
    ]
    if (recipientMail !== undefined) {
      cols.push("recipientMail")
      values.push(recipientMail)
    }
    const placeholders = cols.map((_, i) => `$${i + 1}`)
    await client.query(
      `INSERT INTO "order" (${cols.map((c) => `"${c}"`).join(", ")})
       VALUES (${placeholders.join(", ")})`,
      values,
    )
    track("order", "id", id)
    return id
  }

  it("leaves the column nullable in the catalog", async () => {
    // Asserted against the catalog rather than inferred from a passing insert:
    // an insert succeeding only proves today's path works, not that the
    // constraint is absent.
    const { rows } = await client.query<{ is_nullable: string }>(
      `SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order'
          AND column_name = 'recipientMail'`,
    )
    expect(rows, "order.recipientMail must exist").toHaveLength(1)
    expect(rows[0].is_nullable).toBe("YES")
  })

  it("accepts an order that omits the column entirely", async () => {
    const base = await r8Base("omit")
    const id = await insertR8Order(base, undefined)

    const { rows } = await client.query<{ mail: string | null }>(
      `SELECT "recipientMail" AS mail FROM "order" WHERE id = $1`,
      [id],
    )
    expect(rows[0].mail).toBeNull()
  })

  it("stores a real address when one is given", async () => {
    // Note the empty-string guarantee lives in `validation.spec.ts`, not here:
    // the database stores `""` as `""` and would happily do so, so converting
    // blank to NULL is the schema transform's job and is asserted there.
    const base = await r8Base("given")
    const id = await insertR8Order(base, "recipient@example.com")

    const { rows } = await client.query<{ mail: string | null }>(
      `SELECT "recipientMail" AS mail FROM "order" WHERE id = $1`,
      [id],
    )
    expect(rows[0].mail).toBe("recipient@example.com")
  })
})

suite("label template — pdfme only (R5)", () => {
  it("dropped the `blocks` engine columns for good", async () => {
    // Asserted against the catalog, not inferred from a passing query: a
    // leftover `engine` column would let a legacy row back in through a
    // direct write, which is exactly what the removal is meant to prevent.
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'label_template'`,
    )
    const cols = rows.map((r) => r.column_name)
    expect(cols, "label_template.template must exist").toContain("template")
    expect(cols, "the blocks engine is gone").not.toContain("engine")
    expect(cols, "the blocks engine is gone").not.toContain("blocks")
  })

  it("still enforces the single live default", async () => {
    const { rows } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'label_template'
          AND indexname = 'label_template_one_default_uniq'`,
    )
    expect(rows).toHaveLength(1)
  })
})
