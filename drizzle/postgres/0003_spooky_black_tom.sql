ALTER TABLE "notification" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "readAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
DROP INDEX "notification_user_created_idx";--> statement-breakpoint
CREATE INDEX "notification_user_live_created_idx" ON "notification" USING btree ("userId","createdAt") WHERE "notification"."archivedAt" is null;--> statement-breakpoint
CREATE INDEX "notification_user_unread_idx" ON "notification" USING btree ("userId","createdAt") WHERE "notification"."archivedAt" is null AND "notification"."readAt" is null;--> statement-breakpoint
-- The retention sweep's sibling check asks "does this order have anything newer
-- than the cutoff?". The unique index cannot answer it — `orderId` is its third
-- column, so every probe is a filtered scan.
CREATE INDEX "notification_user_order_created_idx" ON "notification" USING btree ("userId","orderId","createdAt");--> statement-breakpoint
ALTER TABLE "profile" DROP COLUMN "notificationsSeenAt";