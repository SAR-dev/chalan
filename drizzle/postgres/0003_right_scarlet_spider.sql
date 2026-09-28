ALTER TABLE "zone_pricing" ADD COLUMN "cancellationFee" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cancellationFee" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "defaultCancellationFee" numeric(14, 2) DEFAULT 0 NOT NULL;