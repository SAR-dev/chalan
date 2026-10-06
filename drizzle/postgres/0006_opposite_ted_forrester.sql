ALTER TABLE "balance_transaction" DROP CONSTRAINT "balance_transaction_merchantId_merchant_id_fk";
--> statement-breakpoint
ALTER TABLE "zone_delivery_time" DROP CONSTRAINT "zone_delivery_time_fromZoneId_delivery_zone_id_fk";
--> statement-breakpoint
ALTER TABLE "zone_delivery_time" DROP CONSTRAINT "zone_delivery_time_toZoneId_delivery_zone_id_fk";
--> statement-breakpoint
ALTER TABLE "zone_pricing" DROP CONSTRAINT "zone_pricing_fromZoneId_delivery_zone_id_fk";
--> statement-breakpoint
ALTER TABLE "zone_pricing" DROP CONSTRAINT "zone_pricing_toZoneId_delivery_zone_id_fk";
--> statement-breakpoint
ALTER TABLE "balance_transaction" ADD CONSTRAINT "balance_transaction_merchantId_merchant_id_fk" FOREIGN KEY ("merchantId") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_delivery_time" ADD CONSTRAINT "zone_delivery_time_fromZoneId_delivery_zone_id_fk" FOREIGN KEY ("fromZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_delivery_time" ADD CONSTRAINT "zone_delivery_time_toZoneId_delivery_zone_id_fk" FOREIGN KEY ("toZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_pricing" ADD CONSTRAINT "zone_pricing_fromZoneId_delivery_zone_id_fk" FOREIGN KEY ("fromZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_pricing" ADD CONSTRAINT "zone_pricing_toZoneId_delivery_zone_id_fk" FOREIGN KEY ("toZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE restrict ON UPDATE no action;