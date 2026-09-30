CREATE SEQUENCE "public"."merchant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."order_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."payout_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."pickup_location_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."rider_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."warehouse_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"userId" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"tableRowsPerPage" integer DEFAULT 20 NOT NULL,
	"warehouseId" text,
	"merchantId" text,
	"riderId" text,
	"isModerator" boolean DEFAULT false NOT NULL,
	"moderatorPermissions" jsonb,
	"activatedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"impersonatedBy" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "twoFactor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backupCodes" text NOT NULL,
	"userId" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failedVerificationCount" integer DEFAULT 0,
	"lockedUntil" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean,
	"banReason" text,
	"banExpires" timestamp with time zone,
	"twoFactorEnabled" boolean DEFAULT false,
	"activationToken" text,
	"activationTokenExpiresAt" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "balance_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'SETTLED' NOT NULL,
	"note" text,
	"paymentMethod" text,
	"paymentAccount" text,
	"reviewedBy" text,
	"reviewedAt" timestamp with time zone,
	"rejectReason" text,
	"orderId" text,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantId" text NOT NULL,
	"balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"pendingBalance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_balance_merchantId_unique" UNIQUE("merchantId")
);
--> statement-breakpoint
CREATE TABLE "delivery_city" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"zoneId" text NOT NULL,
	"warehouseId" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_city_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "delivery_zone" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zone_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "zone_pricing" (
	"id" text PRIMARY KEY NOT NULL,
	"fromZoneId" text NOT NULL,
	"toZoneId" text NOT NULL,
	"baseRate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"extraRatePerKg" numeric(14, 2) DEFAULT 0 NOT NULL,
	"freeWeightKg" double precision DEFAULT 1 NOT NULL,
	"maxWeightKg" double precision DEFAULT 10 NOT NULL,
	"codFeePercentage" double precision DEFAULT 1 NOT NULL,
	"cancellationFee" numeric(14, 2) DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant" (
	"id" text PRIMARY KEY DEFAULT gen_entity_code('MER', nextval('merchant_id_seq')) NOT NULL,
	"businessName" text NOT NULL,
	"ownerName" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"businessType" text DEFAULT 'Other' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"maxModerators" integer DEFAULT 3 NOT NULL,
	"emailVerifiedAt" timestamp with time zone,
	"emailVerificationToken" text,
	"emailVerificationExpiresAt" timestamp with time zone,
	"phoneVerifiedAt" timestamp with time zone,
	"phoneVerificationOtp" text,
	"phoneVerificationExpiresAt" timestamp with time zone,
	"approvedBy" text,
	"approvedAt" timestamp with time zone,
	"nidFrontImage" text,
	"nidBackImage" text,
	"nidSelfieImage" text,
	"nidNumber" text,
	"nidSubmittedAt" timestamp with time zone,
	"nidVerifiedAt" timestamp with time zone,
	"nidVerifiedBy" text,
	"nidRejectedAt" timestamp with time zone,
	"nidRejectedBy" text,
	"nidRejectionReason" text,
	"brandColor" text,
	"hidePlatformBranding" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_location" (
	"id" text PRIMARY KEY DEFAULT gen_entity_code('PKL', nextval('pickup_location_id_seq')) NOT NULL,
	"merchantId" text NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"cityId" text NOT NULL,
	"mapLink" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY DEFAULT gen_entity_code('ORD', nextval('order_id_seq')) NOT NULL,
	"trackingToken" text,
	"idempotencyKey" text,
	"merchantId" text NOT NULL,
	"pickupLocationId" text NOT NULL,
	"recipientName" text NOT NULL,
	"recipientPhone" text NOT NULL,
	"deliveryAddress" text NOT NULL,
	"deliveryCityId" text,
	"deliveryMapLink" text,
	"parcelWeightKg" double precision NOT NULL,
	"itemType" text,
	"deliveryType" text DEFAULT 'STANDARD' NOT NULL,
	"productCost" numeric(14, 2) NOT NULL,
	"deliveryFee" numeric(14, 2) NOT NULL,
	"codFee" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cancellationFee" numeric(14, 2) DEFAULT 0 NOT NULL,
	"merchantEarnings" numeric(14, 2) DEFAULT 0 NOT NULL,
	"packageId" text,
	"packageTierId" text,
	"merchantPackageId" text,
	"packageRuleType" text,
	"packageRuleValue" double precision,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"approvedBy" text,
	"approvedAt" timestamp with time zone,
	"pickupRiderId" text,
	"assignedAt" timestamp with time zone,
	"pickedUpAt" timestamp with time zone,
	"pickupProofRefs" text[],
	"warehouseId" text NOT NULL,
	"receivedAtWarehouseAt" timestamp with time zone,
	"receivedByWarehouse" text,
	"deliveryRiderId" text,
	"dispatchedAt" timestamp with time zone,
	"dispatchedBy" text,
	"outForDeliveryAt" timestamp with time zone,
	"deliveredAt" timestamp with time zone,
	"deliveryProofRef" text,
	"amountCollected" numeric(14, 2),
	"deliveryShortfallReason" text,
	"failedAttemptAt" timestamp with time zone,
	"failureNote" text,
	"deliveryAttempts" integer DEFAULT 0 NOT NULL,
	"failedResolvedAt" timestamp with time zone,
	"failedResolvedBy" text,
	"returnedAt" timestamp with time zone,
	"returnReason" text,
	"cancelledAt" timestamp with time zone,
	"cancelledBy" text,
	"cancelReason" text,
	"merchantNote" text,
	"receiverNote" text,
	"codSettledAt" timestamp with time zone,
	"codSettledBy" text,
	"payoutRequestId" text
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"orderId" text NOT NULL,
	"fromStatus" text,
	"toStatus" text NOT NULL,
	"transition" text NOT NULL,
	"actorId" text,
	"actorName" text,
	"actorRole" text,
	"note" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_request" (
	"id" text PRIMARY KEY DEFAULT gen_entity_code('PR', nextval('payout_request_id_seq')) NOT NULL,
	"merchantId" text NOT NULL,
	"orderIds" jsonb NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payoutMethod" text NOT NULL,
	"payoutDetails" text NOT NULL,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewedBy" text,
	"reviewedAt" timestamp with time zone,
	"rejectReason" text,
	"paidAt" timestamp with time zone
);
--> statement-breakpoint
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
	"amount" numeric(14, 2) NOT NULL,
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
CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"publishedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"isActive" boolean DEFAULT true NOT NULL,
	"targetRoles" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actorId" text,
	"actorName" text NOT NULL,
	"actorRole" text NOT NULL,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"description" text NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer NOT NULL,
	"error" text,
	"textBody" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"markedSentBy" text,
	"markedSentAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"nextAttemptAt" timestamp with time zone DEFAULT now() NOT NULL,
	"sentAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_config" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"host" text NOT NULL,
	"port" text DEFAULT '587' NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"user" text NOT NULL,
	"pass" text NOT NULL,
	"fromEmail" text NOT NULL,
	"fromName" text DEFAULT 'Delivery Management' NOT NULL,
	"isActive" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"minCodFeePercentage" double precision DEFAULT 0.5 NOT NULL,
	"maxCodFeePercentage" double precision DEFAULT 5 NOT NULL,
	"refundOnCancel" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"actorName" text NOT NULL,
	"actorRole" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"adminReply" text,
	"repliedAt" timestamp with time zone,
	"repliedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider" (
	"id" text PRIMARY KEY DEFAULT gen_entity_code('RID', nextval('rider_id_seq')) NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"zone" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"nidNumber" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"taskType" text DEFAULT 'DELIVERY' NOT NULL,
	"vehicleType" text,
	"vehiclePlate" text,
	"warehouseId" text NOT NULL,
	"approvedBy" text,
	"approvedAt" timestamp with time zone,
	"rejectionReason" text,
	"nidFrontImage" text,
	"nidBackImage" text,
	"nidSelfieImage" text,
	"nidSubmittedAt" timestamp with time zone,
	"nidVerifiedAt" timestamp with time zone,
	"nidVerifiedBy" text,
	"nidRejectedAt" timestamp with time zone,
	"nidRejectedBy" text,
	"nidRejectionReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse" (
	"id" text PRIMARY KEY DEFAULT gen_entity_code('WH', nextval('warehouse_id_seq')) NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"managedBy" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_warehouseId_warehouse_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_riderId_rider_id_fk" FOREIGN KEY ("riderId") REFERENCES "public"."rider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_transaction" ADD CONSTRAINT "balance_transaction_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_transaction" ADD CONSTRAINT "balance_transaction_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_balance" ADD CONSTRAINT "merchant_balance_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_city" ADD CONSTRAINT "delivery_city_zoneId_delivery_zone_id_fk" FOREIGN KEY ("zoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_city" ADD CONSTRAINT "delivery_city_warehouseId_warehouse_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_pricing" ADD CONSTRAINT "zone_pricing_fromZoneId_delivery_zone_id_fk" FOREIGN KEY ("fromZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_pricing" ADD CONSTRAINT "zone_pricing_toZoneId_delivery_zone_id_fk" FOREIGN KEY ("toZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_location" ADD CONSTRAINT "pickup_location_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_location" ADD CONSTRAINT "pickup_location_cityId_delivery_city_id_fk" FOREIGN KEY ("cityId") REFERENCES "public"."delivery_city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_pickupLocationId_pickup_location_id_fk" FOREIGN KEY ("pickupLocationId") REFERENCES "public"."pickup_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_deliveryCityId_delivery_city_id_fk" FOREIGN KEY ("deliveryCityId") REFERENCES "public"."delivery_city"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_packageTierId_pricing_package_tier_id_fk" FOREIGN KEY ("packageTierId") REFERENCES "public"."pricing_package_tier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_merchantPackageId_merchant_package_id_fk" FOREIGN KEY ("merchantPackageId") REFERENCES "public"."merchant_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_pickupRiderId_rider_id_fk" FOREIGN KEY ("pickupRiderId") REFERENCES "public"."rider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_warehouseId_warehouse_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_deliveryRiderId_rider_id_fk" FOREIGN KEY ("deliveryRiderId") REFERENCES "public"."rider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_payoutRequestId_payout_request_id_fk" FOREIGN KEY ("payoutRequestId") REFERENCES "public"."payout_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_request" ADD CONSTRAINT "payout_request_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_package" ADD CONSTRAINT "merchant_package_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_package" ADD CONSTRAINT "merchant_package_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_purchase_request" ADD CONSTRAINT "package_purchase_request_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_purchase_request" ADD CONSTRAINT "package_purchase_request_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_package_tier" ADD CONSTRAINT "pricing_package_tier_packageId_pricing_package_id_fk" FOREIGN KEY ("packageId") REFERENCES "public"."pricing_package"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider" ADD CONSTRAINT "rider_warehouseId_warehouse_id_fk" FOREIGN KEY ("warehouseId") REFERENCES "public"."warehouse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "profile_role_idx" ON "profile" USING btree ("role");--> statement-breakpoint
CREATE INDEX "profile_rider_id_idx" ON "profile" USING btree ("riderId");--> statement-breakpoint
CREATE INDEX "profile_merchant_id_idx" ON "profile" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX "profile_warehouse_id_idx" ON "profile" USING btree ("warehouseId");--> statement-breakpoint
CREATE INDEX "profile_phone_trgm_idx" ON "profile" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "twoFactor" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "twoFactor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "user_name_trgm_idx" ON "user" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_email_trgm_idx" ON "user" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "balance_tx_status_idx" ON "balance_transaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "balance_tx_type_idx" ON "balance_transaction" USING btree ("type");--> statement-breakpoint
CREATE INDEX "balance_tx_order_id_idx" ON "balance_transaction" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "balance_tx_created_at_idx" ON "balance_transaction" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "balance_tx_merchant_id_created_at_idx" ON "balance_transaction" USING btree ("merchantId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_tx_one_pending_payment_uniq" ON "balance_transaction" USING btree ("merchantId") WHERE "balance_transaction"."type" = 'PAYMENT_PENDING' and "balance_transaction"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "delivery_city_zone_id_idx" ON "delivery_city" USING btree ("zoneId");--> statement-breakpoint
CREATE INDEX "delivery_city_warehouse_id_idx" ON "delivery_city" USING btree ("warehouseId");--> statement-breakpoint
CREATE INDEX "zone_pricing_from_idx" ON "zone_pricing" USING btree ("fromZoneId");--> statement-breakpoint
CREATE INDEX "zone_pricing_to_idx" ON "zone_pricing" USING btree ("toZoneId");--> statement-breakpoint
CREATE UNIQUE INDEX "zone_pricing_pair_uniq" ON "zone_pricing" USING btree ("fromZoneId","toZoneId");--> statement-breakpoint
CREATE INDEX "merchant_status_created_at_idx" ON "merchant" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "merchant_created_at_idx" ON "merchant" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_email_unique" ON "merchant" USING btree ("email");--> statement-breakpoint
CREATE INDEX "merchant_email_verified_at_idx" ON "merchant" USING btree ("emailVerifiedAt");--> statement-breakpoint
CREATE INDEX "merchant_nid_submitted_at_idx" ON "merchant" USING btree ("nidSubmittedAt");--> statement-breakpoint
CREATE INDEX "merchant_nid_verified_at_idx" ON "merchant" USING btree ("nidVerifiedAt");--> statement-breakpoint
CREATE INDEX "merchant_nid_rejected_at_idx" ON "merchant" USING btree ("nidRejectedAt");--> statement-breakpoint
CREATE INDEX "merchant_business_name_trgm_idx" ON "merchant" USING gin ("businessName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "merchant_owner_name_trgm_idx" ON "merchant" USING gin ("ownerName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "merchant_email_trgm_idx" ON "merchant" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "merchant_phone_trgm_idx" ON "merchant" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "merchant_nid_number_trgm_idx" ON "merchant" USING gin ("nidNumber" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "pickup_location_merchant_id_idx" ON "pickup_location" USING btree ("merchantId");--> statement-breakpoint
CREATE INDEX "pickup_location_city_id_idx" ON "pickup_location" USING btree ("cityId");--> statement-breakpoint
CREATE INDEX "order_merchant_created_at_idx" ON "order" USING btree ("merchantId","createdAt");--> statement-breakpoint
CREATE INDEX "order_warehouse_created_at_idx" ON "order" USING btree ("warehouseId","createdAt");--> statement-breakpoint
CREATE INDEX "order_delivery_rider_created_at_idx" ON "order" USING btree ("deliveryRiderId","createdAt");--> statement-breakpoint
CREATE INDEX "order_pickup_rider_created_at_idx" ON "order" USING btree ("pickupRiderId","createdAt");--> statement-breakpoint
CREATE INDEX "order_delivery_city_id_idx" ON "order" USING btree ("deliveryCityId");--> statement-breakpoint
CREATE INDEX "order_pickup_location_id_idx" ON "order" USING btree ("pickupLocationId");--> statement-breakpoint
CREATE INDEX "order_created_at_idx" ON "order" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "order_warehouse_status_created_at_idx" ON "order" USING btree ("warehouseId","status","createdAt");--> statement-breakpoint
CREATE INDEX "order_merchant_status_created_at_idx" ON "order" USING btree ("merchantId","status","createdAt");--> statement-breakpoint
CREATE INDEX "order_status_created_at_idx" ON "order" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "order_idempotency_uniq" ON "order" USING btree ("merchantId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "order_cod_settled_at_idx" ON "order" USING btree ("codSettledAt");--> statement-breakpoint
CREATE INDEX "order_payout_request_id_idx" ON "order" USING btree ("payoutRequestId");--> statement-breakpoint
CREATE INDEX "order_merchant_package_id_idx" ON "order" USING btree ("merchantPackageId");--> statement-breakpoint
CREATE UNIQUE INDEX "order_tracking_token_unique" ON "order" USING btree ("trackingToken");--> statement-breakpoint
CREATE INDEX "order_code_trgm_idx" ON "order" USING gin ("id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "order_recipient_name_trgm_idx" ON "order" USING gin ("recipientName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "order_recipient_phone_trgm_idx" ON "order" USING gin ("recipientPhone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history" USING btree ("orderId","createdAt");--> statement-breakpoint
CREATE INDEX "payout_request_status_idx" ON "payout_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payout_request_requested_at_idx" ON "payout_request" USING btree ("requestedAt");--> statement-breakpoint
CREATE INDEX "payout_request_merchant_requested_at_idx" ON "payout_request" USING btree ("merchantId","requestedAt");--> statement-breakpoint
CREATE INDEX "payout_request_merchant_id_status_idx" ON "payout_request" USING btree ("merchantId","status");--> statement-breakpoint
CREATE INDEX "payout_request_code_trgm_idx" ON "payout_request" USING gin ("id" gin_trgm_ops);--> statement-breakpoint
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
CREATE INDEX "announcement_is_active_idx" ON "announcement" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "announcement_published_at_idx" ON "announcement" USING btree ("publishedAt");--> statement-breakpoint
CREATE INDEX "announcement_expires_at_idx" ON "announcement" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "announcement_title_trgm_idx" ON "announcement" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "audit_log_actor_name_trgm_idx" ON "audit_log" USING gin ("actorName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_log_action_trgm_idx" ON "audit_log" USING gin ("action" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_trgm_idx" ON "audit_log" USING gin ("entityType" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_log_description_trgm_idx" ON "audit_log" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_log_status_idx" ON "email_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_log_created_at_idx" ON "email_log" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "email_log_to_trgm_idx" ON "email_log" USING gin ("to" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_log_subject_trgm_idx" ON "email_log" USING gin ("subject" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_outbox_status_next_attempt_idx" ON "email_outbox" USING btree ("status","nextAttemptAt");--> statement-breakpoint
CREATE INDEX "email_outbox_created_at_idx" ON "email_outbox" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "support_ticket_status_created_at_idx" ON "support_ticket" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "support_ticket_user_id_idx" ON "support_ticket" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "support_ticket_subject_trgm_idx" ON "support_ticket" USING gin ("subject" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "support_ticket_message_trgm_idx" ON "support_ticket" USING gin ("message" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "support_ticket_actor_name_trgm_idx" ON "support_ticket" USING gin ("actorName" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "rider_warehouse_id_idx" ON "rider" USING btree ("warehouseId");--> statement-breakpoint
CREATE INDEX "rider_task_type_idx" ON "rider" USING btree ("taskType");--> statement-breakpoint
CREATE INDEX "rider_is_active_idx" ON "rider" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "rider_status_idx" ON "rider" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rider_created_at_idx" ON "rider" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "rider_name_trgm_idx" ON "rider" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "rider_phone_trgm_idx" ON "rider" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "rider_zone_trgm_idx" ON "rider" USING gin ("zone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "rider_email_trgm_idx" ON "rider" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "rider_email_uniq" ON "rider" USING btree (lower("email")) WHERE "rider"."email" <> '';--> statement-breakpoint
CREATE INDEX "warehouse_name_trgm_idx" ON "warehouse" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "warehouse_address_trgm_idx" ON "warehouse" USING gin ("address" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "warehouse_city_trgm_idx" ON "warehouse" USING gin ("city" gin_trgm_ops);