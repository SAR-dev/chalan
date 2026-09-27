CREATE TABLE IF NOT EXISTS "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"html" text,
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
CREATE INDEX IF NOT EXISTS "email_outbox_status_next_attempt_idx" ON "email_outbox" USING btree ("status","nextAttemptAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_created_at_idx" ON "email_outbox" USING btree ("createdAt");
