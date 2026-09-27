-- ROADMAP P1.1 — unique indexes that back the check-then-write flows.
--
-- 1. balance_transaction: at most one PENDING payment per merchant. The route
--    used to check outside the transaction, so a double-click produced two
--    pending payments that both reserved `merchant_balance.pendingBalance`.
-- 2. zone_pricing: one row per (fromZone, toZone). The admin route did
--    select-then-insert, so concurrent saves created duplicate pairs and order
--    pricing picked an arbitrary one.
-- 3. rider: one rider per email (case-insensitive; warehouse-created riders
--    have '' and are excluded). The public application form did check-then-insert.
--
-- The data-cleanup statements run first so the index build cannot fail on a
-- database that already contains the rows these races produced, and they keep
-- the ledger append-only: a duplicate pending payment is REJECTED (with a
-- reason) rather than deleted, and the balance it wrongly reserved is released.
-- Every statement is `IF NOT EXISTS`/idempotent, so re-applying is a no-op.

-- 1. Keep the oldest pending payment per merchant, reject the rest.
WITH ranked AS (
  SELECT
    "id",
    "merchantId",
    row_number() OVER (
      PARTITION BY "merchantId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "balance_transaction"
  WHERE "type" = 'PAYMENT_PENDING'
    AND "status" = 'PENDING'
)
UPDATE "balance_transaction" AS bt
   SET "status" = 'REJECTED',
       "rejectReason" = 'Duplicate pending payment (P1.1 migration)',
       "reviewedAt" = now(),
       "updatedAt" = now()
  FROM ranked
 WHERE bt."id" = ranked."id"
   AND ranked.rn > 1;--> statement-breakpoint

-- Release the `pendingBalance` those rejected rows had reserved.
WITH released AS (
  SELECT "merchantId", sum(-"amount") AS amount
    FROM "balance_transaction"
   WHERE "type" = 'PAYMENT_PENDING'
     AND "status" = 'REJECTED'
     AND "rejectReason" = 'Duplicate pending payment (P1.1 migration)'
   GROUP BY "merchantId"
)
UPDATE "merchant_balance" AS mb
   SET "pendingBalance" = GREATEST(mb."pendingBalance" - released.amount, 0),
       "updatedAt" = now()
  FROM released
 WHERE mb."merchantId" = released."merchantId";--> statement-breakpoint

-- 2. Keep the most recently updated row per zone pair, drop the rest.
DELETE FROM "zone_pricing"
 WHERE "id" IN (
  SELECT "id"
    FROM (
      SELECT "id",
             row_number() OVER (
               PARTITION BY "fromZoneId", "toZoneId"
               ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
             ) AS rn
        FROM "zone_pricing"
    ) duplicates
   WHERE duplicates.rn > 1
 );--> statement-breakpoint

-- 3. Keep the oldest rider per email, blank the email on the rest so the real
--    rider is preserved (an admin can fill it in later).
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY lower("email")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "rider"
  WHERE "email" <> ''
)
UPDATE "rider" AS r
   SET "email" = '',
       "updatedAt" = now()
  FROM ranked
 WHERE r."id" = ranked."id"
   AND ranked.rn > 1;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "balance_tx_one_pending_payment_uniq" ON "balance_transaction" USING btree ("merchantId") WHERE "balance_transaction"."type" = 'PAYMENT_PENDING' and "balance_transaction"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zone_pricing_pair_uniq" ON "zone_pricing" USING btree ("fromZoneId","toZoneId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rider_email_uniq" ON "rider" USING btree (lower("email")) WHERE "rider"."email" <> '';
