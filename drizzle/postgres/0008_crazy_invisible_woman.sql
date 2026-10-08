CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"keyHash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revokedAt" timestamp with time zone,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"endpointId" text NOT NULL,
	"merchantId" text NOT NULL,
	"event" text NOT NULL,
	"orderId" text,
	"payload" jsonb NOT NULL,
	"eventId" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"nextAttemptAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deliveredAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"disabledAt" timestamp with time zone,
	"lastDeliveredAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpointId_webhook_endpoint_id_fk" FOREIGN KEY ("endpointId") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_uniq" ON "api_key" USING btree ("keyHash");--> statement-breakpoint
CREATE INDEX "api_key_merchant_created_idx" ON "api_key" USING btree ("merchantId","createdAt");--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_next_attempt_idx" ON "webhook_delivery" USING btree ("status","nextAttemptAt");--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_idx" ON "webhook_delivery" USING btree ("endpointId");--> statement-breakpoint
CREATE INDEX "webhook_delivery_merchant_created_idx" ON "webhook_delivery" USING btree ("merchantId","createdAt");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_merchant_idx" ON "webhook_endpoint" USING btree ("merchantId");