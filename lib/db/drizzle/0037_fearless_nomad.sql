ALTER TABLE "tax_invoices" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "archived_by_admin_id" integer;