-- Collapse duplicates that predate the unique index, or this CREATE fails on any
-- database that already has them — which is exactly the state this migration is
-- fixing. Run first, and unconditionally: a no-op on a clean table.
--
-- Keeps the newest row of each (recipient, event, order) triple; `id` breaks the
-- tie so the survivor is deterministic across runs rather than arbitrary.
DELETE FROM "notification" n USING "notification" keep
WHERE n."userId" = keep."userId"
  AND n."event" = keep."event"
  AND n."orderId" = keep."orderId"
  AND n."orderId" IS NOT NULL
  AND (n."createdAt", n."id") < (keep."createdAt", keep."id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_user_event_order_uniq" ON "notification" USING btree ("userId","event","orderId") WHERE "notification"."orderId" is not null;