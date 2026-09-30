DROP INDEX "balance_tx_merchant_id_idx";--> statement-breakpoint
DROP INDEX "merchant_status_idx";--> statement-breakpoint
DROP INDEX "order_merchant_id_idx";--> statement-breakpoint
DROP INDEX "order_warehouse_id_idx";--> statement-breakpoint
DROP INDEX "order_pickup_rider_id_idx";--> statement-breakpoint
DROP INDEX "order_delivery_rider_id_idx";--> statement-breakpoint
DROP INDEX "order_status_idx";--> statement-breakpoint
DROP INDEX "payout_request_merchant_id_idx";--> statement-breakpoint
CREATE INDEX "merchant_status_created_at_idx" ON "merchant" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "order_merchant_created_at_idx" ON "order" USING btree ("merchantId","createdAt");--> statement-breakpoint
CREATE INDEX "order_warehouse_created_at_idx" ON "order" USING btree ("warehouseId","createdAt");--> statement-breakpoint
CREATE INDEX "order_delivery_rider_created_at_idx" ON "order" USING btree ("deliveryRiderId","createdAt");--> statement-breakpoint
CREATE INDEX "order_pickup_rider_created_at_idx" ON "order" USING btree ("pickupRiderId","createdAt");--> statement-breakpoint
CREATE INDEX "payout_request_merchant_requested_at_idx" ON "payout_request" USING btree ("merchantId","requestedAt");