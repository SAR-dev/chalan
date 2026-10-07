CREATE TABLE "label_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"widthMm" integer DEFAULT 100 NOT NULL,
	"heightMm" integer DEFAULT 150 NOT NULL,
	"logoRef" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"publishedAt" timestamp with time zone,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "label_template_published_at_idx" ON "label_template" USING btree ("publishedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "label_template_one_default_uniq" ON "label_template" USING btree ("isDefault") WHERE "label_template"."isDefault" = true;