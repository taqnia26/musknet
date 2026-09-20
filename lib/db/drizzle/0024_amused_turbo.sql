ALTER TABLE "tax_invoices" ADD COLUMN "creation_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_creation_key_unique" ON "tax_invoices" USING btree ("creation_key");