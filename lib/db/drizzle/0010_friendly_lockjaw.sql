CREATE TABLE "admin_integrations" (
	"provider_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'configured' NOT NULL,
	"account_label" text,
	"api_base_url" text,
	"configured_by" integer,
	"configured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_integrations" ADD CONSTRAINT "admin_integrations_configured_by_admin_users_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;