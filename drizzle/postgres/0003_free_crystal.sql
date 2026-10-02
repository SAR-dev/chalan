CREATE TABLE "cron_run" (
	"job" text PRIMARY KEY NOT NULL,
	"lastRanAt" timestamp with time zone DEFAULT now() NOT NULL,
	"durationMs" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"lastError" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cron_run_last_ran_at_idx" ON "cron_run" USING btree ("lastRanAt");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "user_activation_token_idx" ON "user" USING btree ("activationToken") WHERE "user"."activationToken" is not null;--> statement-breakpoint
CREATE INDEX "merchant_email_verification_token_idx" ON "merchant" USING btree ("emailVerificationToken") WHERE "merchant"."emailVerificationToken" is not null;--> statement-breakpoint
CREATE INDEX "order_package_id_idx" ON "order" USING btree ("packageId");--> statement-breakpoint
CREATE INDEX "order_package_tier_id_idx" ON "order" USING btree ("packageTierId");