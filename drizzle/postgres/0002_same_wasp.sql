CREATE TABLE "announcement_read" (
	"id" text PRIMARY KEY NOT NULL,
	"announcementId" text NOT NULL,
	"userId" text NOT NULL,
	"readAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_read_unique" ON "announcement_read" USING btree ("announcementId","userId");--> statement-breakpoint
CREATE INDEX "announcement_read_user_idx" ON "announcement_read" USING btree ("userId");