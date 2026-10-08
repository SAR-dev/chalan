ALTER TABLE "label_template" DROP COLUMN "engine";--> statement-breakpoint
ALTER TABLE "label_template" DROP COLUMN "blocks";--> statement-breakpoint
ALTER TABLE "label_template" DROP CONSTRAINT IF EXISTS "label_template_engine_chk";