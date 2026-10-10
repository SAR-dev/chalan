CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"event" text NOT NULL,
	"orderId" text,
	"merchantId" text,
	"actorName" text,
	"title" text NOT NULL,
	"href" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "notificationsSeenAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "notification_created_at_idx" ON "notification" USING btree ("createdAt");