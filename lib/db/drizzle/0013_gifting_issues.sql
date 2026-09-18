CREATE TYPE "public"."gifting_issue_category" AS ENUM('VIP', 'Sample', 'Damage', 'Marketing', 'Tester');--> statement-breakpoint
CREATE TABLE "gifting_issues" (
  "id" serial PRIMARY KEY NOT NULL,
  "recipient_name" text NOT NULL,
  "category" "gifting_issue_category" NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "program" text,
  "product_id" integer NOT NULL,
  "barcode" text NOT NULL,
  "description_snapshot" text NOT NULL,
  "quantity" integer NOT NULL,
  "total_cost" numeric(18, 8) NOT NULL,
  "issue_date" timestamp with time zone,
  "source_filename" text NOT NULL,
  "source_sheet" text NOT NULL,
  "source_row" integer NOT NULL,
  "row_fingerprint" text NOT NULL,
  "import_batch" text NOT NULL,
  "import_fingerprint" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_by" integer NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD CONSTRAINT "gifting_issues_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifting_issues" ADD CONSTRAINT "gifting_issues_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gifting_issues_dedupe_key_unique" ON "gifting_issues" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gifting_issues_row_fingerprint_unique" ON "gifting_issues" USING btree ("row_fingerprint");