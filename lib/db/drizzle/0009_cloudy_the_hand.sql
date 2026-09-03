CREATE TABLE "owner_session_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"recipient_session_id" integer NOT NULL,
	"new_session_id" integer NOT NULL,
	"device_label" text NOT NULL,
	"browser" text NOT NULL,
	"operating_system" text NOT NULL,
	"session_created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_session_notifications" ADD CONSTRAINT "owner_session_notifications_owner_user_id_owner_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."owner_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_session_notifications" ADD CONSTRAINT "owner_session_notifications_recipient_session_id_owner_sessions_id_fk" FOREIGN KEY ("recipient_session_id") REFERENCES "public"."owner_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_session_notifications_recipient_new_unique" ON "owner_session_notifications" USING btree ("recipient_session_id","new_session_id");