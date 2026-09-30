ALTER TABLE "order" ADD COLUMN "itemType" text;--> statement-breakpoint
ALTER TABLE "rider" ADD COLUMN "vehicleType" text;--> statement-breakpoint
ALTER TABLE "rider" ADD COLUMN "vehiclePlate" text;--> statement-breakpoint
ALTER TABLE "merchant" DROP COLUMN "onboardingCompletedAt";