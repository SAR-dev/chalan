DROP TABLE "announcement_read" CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "announcementsSeenAt" timestamp with time zone;