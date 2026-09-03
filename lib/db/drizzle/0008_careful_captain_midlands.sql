ALTER TABLE "owner_sessions" ADD COLUMN "device_label" text DEFAULT 'Unknown device' NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD COLUMN "browser" text DEFAULT 'Unknown browser' NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD COLUMN "operating_system" text DEFAULT 'Unknown operating system' NOT NULL;