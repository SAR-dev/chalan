CREATE TABLE IF NOT EXISTS "order_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"orderId" text NOT NULL,
	"fromStatus" text,
	"toStatus" text NOT NULL,
	"transition" text NOT NULL,
	"actorId" text,
	"actorName" text,
	"actorRole" text,
	"note" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_orderId_order_id_fk'
	) THEN
		ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_history_order_id_created_at_idx" ON "order_status_history" USING btree ("orderId","createdAt");
