ALTER TABLE "storefront_products" ADD COLUMN "display_name_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "display_name_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "invoice_name_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "invoice_name_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "storefront_products" SET
  "display_name_ar" = "name_ar",
  "display_name_en" = "name_en",
  "invoice_name_ar" = "name_ar",
  "invoice_name_en" = "name_en";--> statement-breakpoint
ALTER TABLE "tax_invoice_items" ADD COLUMN "product_name_en" text;