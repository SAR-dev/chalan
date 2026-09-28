ALTER TABLE "order" ADD COLUMN "idempotencyKey" text;--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "refundOnCancel" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "order_idempotency_uniq" ON "order" USING btree ("merchantId","idempotencyKey");