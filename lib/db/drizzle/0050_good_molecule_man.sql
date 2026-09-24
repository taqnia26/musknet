ALTER TABLE "tax_invoices" ADD COLUMN "uploaded_contract_file_id" integer;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "payment_term" text;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "contract_type" text;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "payment_term" text;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "payment_days" integer;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "terms_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD COLUMN "terms_confirmed_by" integer;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_uploaded_contract_file_id_uploaded_contract_files_id_fk" FOREIGN KEY ("uploaded_contract_file_id") REFERENCES "public"."uploaded_contract_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_contract_files" ADD CONSTRAINT "uploaded_contract_files_terms_confirmed_by_admin_users_id_fk" FOREIGN KEY ("terms_confirmed_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "invoice_single_contract_source" CHECK (not ("tax_invoices"."contract_id" is not null and "tax_invoices"."uploaded_contract_file_id" is not null));