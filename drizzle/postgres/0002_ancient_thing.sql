ALTER TABLE "merchant" ADD COLUMN "businessType" text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN "onboardingCompletedAt" timestamp with time zone;