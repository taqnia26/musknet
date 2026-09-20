CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"order_id" integer,
	"invoice_id" integer,
	"destination_city" text NOT NULL,
	"destination_address" text,
	"carrier" text,
	"service_method" text,
	"tracking_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"actual_cost" double precision,
	"collected_cost" double precision,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_storefront_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."storefront_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_invoice_id_tax_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tax_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_order_id_unique" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_invoice_id_unique" ON "shipments" USING btree ("invoice_id");
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_source_check"
CHECK (
  ("channel" = 'online' AND "order_id" IS NOT NULL AND "invoice_id" IS NULL)
  OR
  ("channel" = 'b2b' AND "invoice_id" IS NOT NULL AND "order_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_status_check"
CHECK ("status" IN ('pending', 'ready', 'in_transit', 'delivered', 'returned', 'cancelled'));
--> statement-breakpoint
INSERT INTO "shipments" (
  "channel", "order_id", "destination_city", "destination_address",
  "service_method", "tracking_number", "status", "collected_cost",
  "shipped_at", "delivered_at", "created_at", "updated_at"
)
SELECT
  'online',
  o."id",
  COALESCE(NULLIF(a."city", ''), 'Unknown'),
  concat_ws(', ', NULLIF(a."district", ''), NULLIF(a."street", ''), NULLIF(a."building_no", '')),
  o."shipping_method",
  o."tracking_number",
  CASE
    WHEN o."status" = 'delivered' THEN 'delivered'
    WHEN o."status" = 'shipped' THEN 'in_transit'
    WHEN o."status" = 'cancelled' THEN 'cancelled'
    WHEN o."status" = 'processing' THEN 'ready'
    ELSE 'pending'
  END,
  o."shipping_cost",
  CASE WHEN o."status" IN ('shipped', 'delivered') THEN o."updated_at" ELSE NULL END,
  CASE WHEN o."status" = 'delivered' THEN o."updated_at" ELSE NULL END,
  o."created_at",
  o."updated_at"
FROM "storefront_orders" o
LEFT JOIN "storefront_order_addresses" a ON a."order_id" = o."id"
ON CONFLICT ("order_id") DO NOTHING;