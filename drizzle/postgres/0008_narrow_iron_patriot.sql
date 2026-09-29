CREATE TABLE "merchant_package" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"packageId" text NOT NULL,
	"ordersUsed" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"assignedBy" text,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"endedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_purchase_request" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"packageId" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewedBy" text,
	"reviewedAt" timestamp with time zone,
	"rejectReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_package" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_package_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"packageId" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"orderCount" integer NOT NULL,
	"ruleType" text NOT NULL,
	"ruleValue" double precision NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "packageId" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "packageTierId" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "merchantPackageId" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "packageRuleType" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "packageRuleValue" double precision;--> statement-breakpoint
ALTER TABLE "merchant_package" ADD CONSTRAINT "merchant_package_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_package" ADD CONSTRAINT "merchant_package_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_purchase_request" ADD CONSTRAINT "package_purchase_request_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_purchase_request" ADD CONSTRAINT "package_purchase_request_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_package_tier" ADD CONSTRAINT "pricing_package_tier_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_package_merchant_id_idx" ON "merchant_package" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX "merchant_package_package_id_idx" ON "merchant_package" USING btree ("packageId");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_package_one_active_uniq" ON "merchant_package" USING btree ("merchantId") WHERE "merchant_package"."isActive" = true;--> statement-breakpoint
CREATE INDEX "package_purchase_request_merchant_id_idx" ON "package_purchase_request" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX "package_purchase_request_status_idx" ON "package_purchase_request" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "package_purchase_request_one_pending_uniq" ON "package_purchase_request" USING btree ("merchantId") WHERE "package_purchase_request"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "pricing_package_is_active_idx" ON "pricing_package" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "pricing_package_name_trgm_idx" ON "pricing_package" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "pricing_package_tier_package_id_idx" ON "pricing_package_tier" USING btree ("packageId");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_package_tier_package_order_uniq" ON "pricing_package_tier" USING btree ("packageId","orderCount");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_package_tier_package_sort_uniq" ON "pricing_package_tier" USING btree ("packageId","sortOrder");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_packageTierId_pricing_package_tier_id_fk" FOREIGN KEY ("packageTierId") REFERENCES "public"."pricing_package_tier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_merchantPackageId_merchant_package_id_fk" FOREIGN KEY ("merchantPackageId") REFERENCES "public"."merchant_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_merchant_package_id_idx" ON "order" USING btree ("merchantPackageId");