DO $$ BEGIN
 CREATE TYPE "purchase_category" AS ENUM ('direct_materials_oils','travel_tickets','meeting_hospitality','shipping','marketing','utilities','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 CREATE TYPE "purchase_payment_source" AS ENUM ('company_account','owner_account');
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(19,4) NOT NULL,
  "purchase_date" date NOT NULL,
  "notes" text,
  "category" "purchase_category" NOT NULL,
  "payment_source" "purchase_payment_source" NOT NULL,
  "invoice_object_path" text,
  "invoice_content_type" text,
  "invoice_size" integer,
  "idempotency_key" text,
  "archived_at" timestamp with time zone,
  "created_by" integer NOT NULL REFERENCES "admin_users"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchases_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "purchases_invoice_size_valid" CHECK ("invoice_size" IS NULL OR ("invoice_size" > 0 AND "invoice_size" <= 10485760))
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchases_idempotency_key_unique" ON "purchases" ("idempotency_key");
INSERT INTO "accounting_accounts" ("code","name_ar","name_en","account_type","normal_balance","parent_id","is_posting","is_active")
SELECT '2140','ذمم مستحقة للمالك','Owner Payable','liability','credit',id,true,true FROM "accounting_accounts" WHERE "code"='2100'
ON CONFLICT ("code") DO NOTHING;