ALTER TABLE "merchant" ADD COLUMN "logoUrl" text;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN "brandColor" text;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN "hidePlatformBranding" boolean DEFAULT false NOT NULL;