CREATE TABLE IF NOT EXISTS "site_content_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"deleted_by" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_by" text,
	"restored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_content_history_deleted_at_idx" ON "site_content_history" USING btree ("deleted_at");