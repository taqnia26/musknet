CREATE TABLE "shiphero_dispatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"order_number" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"remote_order_id" text,
	"payload" jsonb,
	"response" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shiphero_product_mappings" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"sku" text NOT NULL,
	"registration_kind" text DEFAULT 'existing' NOT NULL,
	"remote_product_id" text,
	"create_status" text DEFAULT 'not_requested' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shiphero_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"dry_shipping_code" text,
	"cold_shipping_code" text,
	"cold_coverage_cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status_mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"catalog_baseline_max_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shiphero_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"outcome" text DEFAULT 'received' NOT NULL,
	"detail" text,
	"event_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "storefront_orders" ADD COLUMN "status_manually_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "status_manually_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shiphero_dispatches" ADD CONSTRAINT "shiphero_dispatches_order_id_storefront_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."storefront_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shiphero_product_mappings" ADD CONSTRAINT "shiphero_product_mappings_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shiphero_dispatch_order_unique" ON "shiphero_dispatches" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shiphero_dispatch_number_unique" ON "shiphero_dispatches" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "shiphero_dispatch_status_idx" ON "shiphero_dispatches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shiphero_product_mapping_sku_unique" ON "shiphero_product_mappings" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "shiphero_webhook_message_unique" ON "shiphero_webhook_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "shiphero_webhook_outcome_idx" ON "shiphero_webhook_events" USING btree ("outcome");
--> statement-breakpoint
-- Protect the pre-integration catalog without guessing partner names or SKUs.
-- Product mappings remain empty until the partner's confirmed list is supplied.
INSERT INTO "shiphero_settings" ("id", "catalog_baseline_max_id")
SELECT 'main', COALESCE(MAX("id"), 0) FROM "storefront_products"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Existing status history predates explicit manual clocks. Conservatively retain
-- its last known update so old provider events cannot overwrite it.
UPDATE "storefront_orders" SET "status_manually_updated_at" = "updated_at"
WHERE "status_manually_updated_at" IS NULL;
--> statement-breakpoint
UPDATE "shipments" SET "status_manually_updated_at" = "updated_at"
WHERE "status_manually_updated_at" IS NULL;