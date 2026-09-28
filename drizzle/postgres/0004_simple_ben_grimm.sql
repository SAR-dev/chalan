ALTER TABLE "merchant" ADD COLUMN "cancellationFee" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "deliveryShortfallReason" text;--> statement-breakpoint
-- Backfill the cancellation fee for orders created before the column existed
-- (ROADMAP B5). Without this, an in-flight FAILED_ATTEMPT parcel would snapshot
-- 0 and a return would refund the full delivery + COD fees. Terminal orders
-- (DELIVERED/RETURNED/CANCELLED) can never be returned, so they are left at 0.
UPDATE "order" o
SET "cancellationFee" = COALESCE(
  (
    SELECT zp."cancellationFee"
    FROM "zone_pricing" zp
    JOIN "delivery_city" dest ON dest."id" = o."deliveryCityId"
    JOIN "warehouse" w ON w."id" = o."warehouseId"
    JOIN "delivery_city" orig ON orig."name" = w."city"
    WHERE zp."fromZoneId" = orig."zoneId" AND zp."toZoneId" = dest."zoneId"
    LIMIT 1
  ),
  (SELECT "defaultCancellationFee" FROM "platform_config" WHERE "id" = 'default'),
  0
)
WHERE o."status" NOT IN ('DELIVERED', 'RETURNED', 'CANCELLED');
