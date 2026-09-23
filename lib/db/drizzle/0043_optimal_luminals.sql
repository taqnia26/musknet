ALTER TABLE "whatsapp_chats" ADD COLUMN "name_source" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_chats" ADD COLUMN "manual_name" text;