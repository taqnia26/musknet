ALTER TYPE "public"."gifting_issue_category" ADD VALUE 'B2B_EVALUATION';--> statement-breakpoint
ALTER TYPE "public"."gifting_issue_category" ADD VALUE 'TESTER';--> statement-breakpoint
ALTER TYPE "public"."gifting_issue_category" ADD VALUE 'VIP_GIFT';--> statement-breakpoint
ALTER TYPE "public"."gifting_issue_category" ADD VALUE 'INFLUENCERS';--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "recipient_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "issue_date" SET DEFAULT now();--> statement-breakpoint
UPDATE "gifting_issues" SET "issue_date" = "imported_at" WHERE "issue_date" IS NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "issue_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "source_filename" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "source_sheet" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "source_row" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "row_fingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "import_batch" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ALTER COLUMN "import_fingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "occasion" text;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "gifting_issues_idempotency_key_unique" ON "gifting_issues" USING btree ("idempotency_key");