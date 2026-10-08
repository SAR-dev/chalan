ALTER TABLE "label_template" ADD COLUMN "engine" text DEFAULT 'blocks' NOT NULL;--> statement-breakpoint
ALTER TABLE "label_template" ADD COLUMN "template" jsonb;ALTER TABLE "label_template" ADD CONSTRAINT "label_template_engine_chk" CHECK ("engine" IN ('blocks','pdfme'));--> statement-breakpoint
ALTER TABLE "label_template" ADD CONSTRAINT "label_template_pdfme_has_template" CHECK ("engine" <> 'pdfme' OR "template" IS NOT NULL);
--> statement-breakpoint
