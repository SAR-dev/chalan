-- ROADMAP P1.6 — profile domain FKs, hot-path indexes and trgm indexes.
-- Idempotent: safe to re-run (the ledger normally prevents that anyway).

-- Unlink any profile whose referent no longer exists so the FKs can be added.
UPDATE "profile" SET "warehouseId" = NULL
 WHERE "warehouseId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "warehouse" w WHERE w.id = "profile"."warehouseId");--> statement-breakpoint
UPDATE "profile" SET "merchantId" = NULL
 WHERE "merchantId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "merchant" m WHERE m.id = "profile"."merchantId");--> statement-breakpoint
UPDATE "profile" SET "riderId" = NULL
 WHERE "riderId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "rider" r WHERE r.id = "profile"."riderId");--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_warehouseId_warehouse_id_fk') THEN
		ALTER TABLE "profile" ADD CONSTRAINT "profile_warehouseId_warehouse_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouse"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_merchantId_merchant_id_fk') THEN
		ALTER TABLE "profile" ADD CONSTRAINT "profile_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_riderId_rider_id_fk') THEN
		ALTER TABLE "profile" ADD CONSTRAINT "profile_riderId_rider_id_fk" FOREIGN KEY ("riderId") REFERENCES "public"."rider"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_merchant_id_idx" ON "profile" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_warehouse_id_idx" ON "profile" USING btree ("warehouseId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_nid_number_trgm_idx" ON "merchant" USING gin ("nidNumber" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_ticket_subject_trgm_idx" ON "support_ticket" USING gin ("subject" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_ticket_message_trgm_idx" ON "support_ticket" USING gin ("message" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_ticket_actor_name_trgm_idx" ON "support_ticket" USING gin ("actorName" gin_trgm_ops);
