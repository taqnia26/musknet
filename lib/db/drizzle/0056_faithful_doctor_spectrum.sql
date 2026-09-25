ALTER TABLE "tax_invoice_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "historical" text DEFAULT 'no' NOT NULL;