CREATE TABLE "tax_invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"sku" text,
	"quantity" integer NOT NULL,
	"unit_price" double precision NOT NULL,
	"subtotal" double precision NOT NULL,
	"vat_amount" double precision NOT NULL,
	"total_amount" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "commercial_registration_number" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "distributor_id" integer;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "buyer_name" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "buyer_tax_number" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "buyer_commercial_registration_number" text;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "buyer_address" text;--> statement-breakpoint
ALTER TABLE "tax_invoice_items" ADD CONSTRAINT "tax_invoice_items_invoice_id_tax_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tax_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoice_items" ADD CONSTRAINT "tax_invoice_items_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_distributor_id_wholesale_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."wholesale_distributors"("id") ON DELETE restrict ON UPDATE no action;