ALTER TABLE "storefront_products" ADD COLUMN "weight_kg" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "cost_price" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "discount_price" double precision;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "discount_ends_on" date;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "mpn" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "subtitle_ar" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "promotional_title_ar" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "max_per_customer" integer;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "requires_shipping" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "allow_order_attachment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "allow_customer_note" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "registration_number" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "seo_title_ar" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "seo_description_ar" text;