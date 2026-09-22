ALTER TABLE "shipments" ADD COLUMN "national_address_short_code" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "destination_country" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "destination_district" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "destination_street" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "destination_building_number" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "destination_postal_code" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "destination_additional_details" text;