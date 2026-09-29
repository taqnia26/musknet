CREATE TABLE IF NOT EXISTS "salla_invoice_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"salla_invoice_id" text NOT NULL,
	"salla_order_id" text NOT NULL,
	"invoice_number" text,
	"invoice_uuid" text,
	"invoice_reference_id" text,
	"qr_code" text,
	"payment_method" text,
	"invoice_type" text NOT NULL,
	"issued_on" date NOT NULL,
	"currency" text NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"shipping_cost" numeric(14, 2) NOT NULL,
	"cod_cost" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"vat_percent" numeric(6, 2),
	"total" numeric(14, 2) NOT NULL,
	"items" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN IF NOT EXISTS "invoice_discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN IF NOT EXISTS "discount_override_reason" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN IF NOT EXISTS "discount_override_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN IF NOT EXISTS "discount_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "cancelled_by_admin_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "salla_invoice_archive_source_id_unique" ON "salla_invoice_archive" USING btree ("salla_invoice_id");--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_invoices_discount_override_by_admin_id_admin_users_id_fk') THEN ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_discount_override_by_admin_id_admin_users_id_fk" FOREIGN KEY ("discount_override_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_cancelled_by_admin_id_admin_users_id_fk" FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;