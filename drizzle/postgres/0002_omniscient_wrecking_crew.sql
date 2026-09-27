ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "isModerator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "moderatorPermissions" jsonb;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "activatedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "activationToken" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "activationTokenExpiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN IF NOT EXISTS "maxModerators" integer DEFAULT 3 NOT NULL;
