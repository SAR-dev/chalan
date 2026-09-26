ALTER TABLE "profile" ADD COLUMN "isModerator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "moderatorPermissions" jsonb;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "activatedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "activationToken" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "activationTokenExpiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchant" ADD COLUMN "maxModerators" integer DEFAULT 3 NOT NULL;