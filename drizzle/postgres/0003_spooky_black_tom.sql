ALTER TABLE "notification" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "readAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "archivedAt" timestamp with time zone;--> statement-breakpoint
-- Carry the old watermark onto the rows before dropping it.
--
-- Without this every existing row lands with `readAt = null`, which under the new
-- model means *unread* — so each merchant's whole inbox would come back as one
-- enormous unread badge the day this deploys. The watermark being dropped
-- already holds the truth, so translate it: a row that predates the reader's
-- last visit was seen, a row after it was not.
--
-- Stamping `createdAt` rather than the watermark keeps "read before this parcel
-- even existed" honest — the reader saw it the moment it arrived, not at some
-- later moment.
--
-- Recipients with a NULL watermark never opened their inbox, so they keep every
-- row unread, which is what they would have seen before too.
UPDATE notification n
SET "readAt" = n."createdAt"
FROM profile p
WHERE p."userId" = n."userId"
  AND p."notificationsSeenAt" IS NOT NULL
  AND n."createdAt" <= p."notificationsSeenAt";--> statement-breakpoint
-- Superseded by the partial indexes below, which match the queries that now
-- exist: a live inbox and an unread count. Dropping the old one keeps the table
-- from carrying two indexes for the same read.
DROP INDEX "notification_user_created_idx";--> statement-breakpoint
CREATE INDEX "notification_user_live_created_idx" ON "notification" USING btree ("userId","createdAt") WHERE "notification"."archivedAt" is null;--> statement-breakpoint
CREATE INDEX "notification_user_unread_idx" ON "notification" USING btree ("userId","createdAt") WHERE "notification"."archivedAt" is null AND "notification"."readAt" is null;--> statement-breakpoint
-- The retention sweep's sibling check asks "does this order have anything newer
-- than the cutoff?". The unique index cannot answer it — `orderId` is its third
-- column, so every probe is a filtered scan.
CREATE INDEX "notification_user_order_created_idx" ON "notification" USING btree ("userId","orderId","createdAt");--> statement-breakpoint
ALTER TABLE "profile" DROP COLUMN "notificationsSeenAt";