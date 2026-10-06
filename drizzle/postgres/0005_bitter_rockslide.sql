CREATE TABLE "zone_delivery_time" (
	"id" text PRIMARY KEY NOT NULL,
	"fromZoneId" text NOT NULL,
	"toZoneId" text NOT NULL,
	"deliveryDays" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "expectedDeliveryDays" integer;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "expectedDeliveryAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "actualDeliveryDays" integer;--> statement-breakpoint
ALTER TABLE "zone_delivery_time" ADD CONSTRAINT "zone_delivery_time_fromZoneId_delivery_zone_id_fk" FOREIGN KEY ("fromZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_delivery_time" ADD CONSTRAINT "zone_delivery_time_toZoneId_delivery_zone_id_fk" FOREIGN KEY ("toZoneId") REFERENCES "public"."delivery_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zone_delivery_time_from_idx" ON "zone_delivery_time" USING btree ("fromZoneId");--> statement-breakpoint
CREATE INDEX "zone_delivery_time_to_idx" ON "zone_delivery_time" USING btree ("toZoneId");--> statement-breakpoint
CREATE UNIQUE INDEX "zone_delivery_time_pair_uniq" ON "zone_delivery_time" USING btree ("fromZoneId","toZoneId");