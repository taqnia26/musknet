ALTER TABLE "storefront_addresses" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "storefront_addresses" ADD COLUMN "national_address_short_code" text;--> statement-breakpoint
ALTER TABLE "storefront_addresses" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "storefront_addresses" ADD COLUMN "additional_number" text;--> statement-breakpoint
ALTER TABLE "storefront_addresses" ADD COLUMN "is_profile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_order_addresses" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "storefront_order_addresses" ADD COLUMN "additional_number" text;--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "national_address_short_code" text;--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "district" text;--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "building_no" text;--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "wholesale_distributors" ADD COLUMN "additional_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_addresses_one_profile_per_user" ON "storefront_addresses" USING btree ("user_id") WHERE "storefront_addresses"."is_profile" = true;