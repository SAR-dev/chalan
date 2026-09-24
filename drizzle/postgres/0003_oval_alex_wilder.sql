CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"actorName" text NOT NULL,
	"actorRole" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"adminReply" text,
	"repliedAt" timestamp with time zone,
	"repliedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_ticket_status_created_at_idx" ON "support_ticket" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "support_ticket_user_id_idx" ON "support_ticket" USING btree ("userId");