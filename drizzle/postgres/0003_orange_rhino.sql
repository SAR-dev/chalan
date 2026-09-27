ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "trackingToken" text;--> statement-breakpoint
UPDATE "order" SET "trackingToken" = md5(random()::text || clock_timestamp()::text || "id") WHERE "trackingToken" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_tracking_token_unique" ON "order" USING btree ("trackingToken");
