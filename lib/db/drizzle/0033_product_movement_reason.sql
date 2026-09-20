ALTER TYPE "public"."gifting_issue_category" ADD VALUE IF NOT EXISTS 'DAMAGED';--> statement-breakpoint
ALTER TYPE "public"."gifting_issue_category" ADD VALUE IF NOT EXISTS 'OTHER';--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN IF NOT EXISTS "reason" text;