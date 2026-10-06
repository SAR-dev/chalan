ALTER TABLE "order" ADD CONSTRAINT "order_delivered_needs_delivered_at" CHECK ("order"."status" <> 'DELIVERED' OR "order"."deliveredAt" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_cancelled_needs_cancelled_at" CHECK ("order"."status" <> 'CANCELLED' OR "order"."cancelledAt" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_returned_needs_returned_at" CHECK ("order"."status" <> 'RETURNED' OR "order"."returnedAt" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_picked_up_needs_picked_up_at" CHECK ("order"."status" <> 'PICKED_UP' OR "order"."pickedUpAt" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_out_for_pickup_needs_out_for_pickup_at" CHECK ("order"."status" <> 'OUT_FOR_PICKUP' OR "order"."outForPickupAt" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_out_for_delivery_needs_out_for_delivery_at" CHECK ("order"."status" <> 'OUT_FOR_DELIVERY' OR "order"."outForDeliveryAt" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_product_cost_nonneg" CHECK ("order"."productCost" >= 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_delivery_fee_nonneg" CHECK ("order"."deliveryFee" >= 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_cod_fee_nonneg" CHECK ("order"."codFee" >= 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_cancellation_fee_nonneg" CHECK ("order"."cancellationFee" >= 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_merchant_earnings_nonneg" CHECK ("order"."merchantEarnings" >= 0);--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_amount_collected_nonneg" CHECK ("order"."amountCollected" IS NULL OR "order"."amountCollected" >= 0);