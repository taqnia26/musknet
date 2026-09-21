ALTER TABLE "gifting_issues" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE "gifting_issues" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "gifting_issues" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;
ALTER TABLE "gifting_issues" ADD COLUMN IF NOT EXISTS "voided_by" integer REFERENCES "admin_users"("id") ON DELETE RESTRICT;