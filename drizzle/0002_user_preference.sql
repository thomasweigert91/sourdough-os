CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"temperature_unit" text DEFAULT 'C' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;