ALTER TABLE "failed_mail" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "failed_mail" CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_email_unique" ON "merchant" USING btree ("email");--> statement-breakpoint
CREATE INDEX "order_delivery_city_id_idx" ON "order" USING btree ("deliveryCityId");