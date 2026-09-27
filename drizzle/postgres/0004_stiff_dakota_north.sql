-- ROADMAP P0.8 — money columns move from double precision to numeric(14,2).
--
-- double precision is a binary float: 0.1 is stored as 0.1000000000000000055…, so
-- a ledger of such values drifts and can never be audited exactly. P0.4 rounds
-- at every write boundary and added a reconciliation test, but exact-decimal
-- auditing is only possible with a decimal storage type.
--
-- The USING clause does the backfill: every existing float is rounded to paisa
-- on the way in, so the migration is a no-op when applied twice (converting
-- numeric to numeric) and safe to re-run after `db:push`.
--
-- Weights and percentages are deliberately NOT in this list — they are
-- measurements and ratios (0.125 kg, 1.5 %), not money, and scale 2 would throw
-- away meaningful precision.

ALTER TABLE "balance_transaction" ALTER COLUMN "amount" SET DATA TYPE numeric(14, 2) USING round("amount"::numeric, 2);--> statement-breakpoint
ALTER TABLE "merchant_balance" ALTER COLUMN "balance" SET DATA TYPE numeric(14, 2) USING round("balance"::numeric, 2);--> statement-breakpoint
ALTER TABLE "merchant_balance" ALTER COLUMN "pendingBalance" SET DATA TYPE numeric(14, 2) USING round("pendingBalance"::numeric, 2);--> statement-breakpoint
ALTER TABLE "zone_pricing" ALTER COLUMN "baseRate" SET DATA TYPE numeric(14, 2) USING round("baseRate"::numeric, 2);--> statement-breakpoint
ALTER TABLE "zone_pricing" ALTER COLUMN "extraRatePerKg" SET DATA TYPE numeric(14, 2) USING round("extraRatePerKg"::numeric, 2);--> statement-breakpoint
ALTER TABLE "merchant" ALTER COLUMN "baseRate" SET DATA TYPE numeric(14, 2) USING round("baseRate"::numeric, 2);--> statement-breakpoint
ALTER TABLE "merchant" ALTER COLUMN "extraRatePerKg" SET DATA TYPE numeric(14, 2) USING round("extraRatePerKg"::numeric, 2);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "productCost" SET DATA TYPE numeric(14, 2) USING round("productCost"::numeric, 2);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "deliveryFee" SET DATA TYPE numeric(14, 2) USING round("deliveryFee"::numeric, 2);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "codFee" SET DATA TYPE numeric(14, 2) USING round("codFee"::numeric, 2);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "merchantEarnings" SET DATA TYPE numeric(14, 2) USING round("merchantEarnings"::numeric, 2);--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "amountCollected" SET DATA TYPE numeric(14, 2) USING round("amountCollected"::numeric, 2);--> statement-breakpoint
ALTER TABLE "payout_request" ALTER COLUMN "amount" SET DATA TYPE numeric(14, 2) USING round("amount"::numeric, 2);--> statement-breakpoint
ALTER TABLE "platform_config" ALTER COLUMN "defaultBaseRate" SET DATA TYPE numeric(14, 2) USING round("defaultBaseRate"::numeric, 2);--> statement-breakpoint
ALTER TABLE "platform_config" ALTER COLUMN "defaultExtraRatePerKg" SET DATA TYPE numeric(14, 2) USING round("defaultExtraRatePerKg"::numeric, 2);
