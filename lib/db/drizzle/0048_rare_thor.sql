ALTER TABLE "tax_invoices" ADD COLUMN "contract_id" integer;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "contract_number" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "contract_type" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "contract_discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "payment_days" integer;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "tax_treatment" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "vat_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "discount_amount" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_contract_id_distributor_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."distributor_contracts"("id") ON DELETE set null ON UPDATE no action;