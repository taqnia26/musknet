CREATE TYPE "public"."b2b_return_condition" AS ENUM('new', 'used');--> statement-breakpoint
CREATE TYPE "public"."b2b_stock_source" AS ENUM('normal', 'used_return');--> statement-breakpoint
ALTER TYPE "public"."gifting_issue_category" ADD VALUE 'DAMAGED';--> statement-breakpoint
ALTER TYPE "public"."gifting_issue_category" ADD VALUE 'OTHER';--> statement-breakpoint
CREATE TABLE "whatsapp_auth_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_chats" (
	"jid" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"unread" integer DEFAULT 0 NOT NULL,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_jid" text NOT NULL,
	"text" text NOT NULL,
	"from_me" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "stock_source" "b2b_stock_source" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "returned_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "return_condition" "b2b_return_condition";--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "voided_by" integer;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "shipping_scope" text DEFAULT 'domestic' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_chat_jid_whatsapp_chats_jid_fk" FOREIGN KEY ("chat_jid") REFERENCES "public"."whatsapp_chats"("jid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD CONSTRAINT "gifting_issues_voided_by_admin_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD CONSTRAINT "gifting_issues_returned_quantity_valid" CHECK ("gifting_issues"."returned_quantity" >= 0 and "gifting_issues"."returned_quantity" <= "gifting_issues"."quantity");