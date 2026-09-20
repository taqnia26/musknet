CREATE TYPE "public"."inventory_cycle_count_status" AS ENUM('draft', 'review', 'approved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inventory_balance_state" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."inventory_location_type" AS ENUM('warehouse', 'store', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."inventory_purchase_order_status" AS ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inventory_transfer_status" AS ENUM('draft', 'sent', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "inventory_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"location_id" integer,
	"kind" text NOT NULL,
	"reorder_quantity" integer DEFAULT 0 NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"incoming" integer DEFAULT 0 NOT NULL,
	"average_cost" numeric(19, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_nonnegative" CHECK ("inventory_balances"."available" >= 0 and "inventory_balances"."reserved" >= 0 and "inventory_balances"."incoming" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_cycle_count_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_count_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"expected_quantity" integer NOT NULL,
	"counted_quantity" integer NOT NULL,
	"unit_cost" numeric(19, 4) DEFAULT '0' NOT NULL,
	"note" text,
	CONSTRAINT "inventory_cycle_count_nonnegative" CHECK ("inventory_cycle_count_lines"."expected_quantity" >= 0 and "inventory_cycle_count_lines"."counted_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_cycle_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"status" "inventory_cycle_count_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" "inventory_location_type" DEFAULT 'warehouse' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_purchase_order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"ordered_quantity" integer NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"unit_cost" numeric(19, 4) NOT NULL,
	"received_at" timestamp with time zone,
	CONSTRAINT "inventory_purchase_order_quantities" CHECK ("inventory_purchase_order_lines"."ordered_quantity" > 0 and "inventory_purchase_order_lines"."received_quantity" >= 0 and "inventory_purchase_order_lines"."received_quantity" <= "inventory_purchase_order_lines"."ordered_quantity")
);
--> statement-breakpoint
CREATE TABLE "inventory_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"vendor_name" text NOT NULL,
	"location_id" integer NOT NULL,
	"status" "inventory_purchase_order_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfer_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(19, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "inventory_transfer_lines_positive" CHECK ("inventory_transfer_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_number" text NOT NULL,
	"from_location_id" integer NOT NULL,
	"to_location_id" integer NOT NULL,
	"status" "inventory_transfer_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "operational_type" text DEFAULT 'finished_good' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "unit_of_measure" text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "preferred_supplier" text;--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "sellable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cycle_count_lines" ADD CONSTRAINT "inventory_cycle_count_lines_cycle_count_id_inventory_cycle_counts_id_fk" FOREIGN KEY ("cycle_count_id") REFERENCES "public"."inventory_cycle_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cycle_count_lines" ADD CONSTRAINT "inventory_cycle_count_lines_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cycle_counts" ADD CONSTRAINT "inventory_cycle_counts_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cycle_counts" ADD CONSTRAINT "inventory_cycle_counts_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cycle_counts" ADD CONSTRAINT "inventory_cycle_counts_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_purchase_order_id_inventory_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."inventory_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transfer_id_inventory_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."inventory_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_location_id_inventory_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_location_id_inventory_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_alert_dedupe_unique" ON "inventory_alerts" USING btree ("product_id","location_id","kind","acknowledged");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_balances_product_location_unique" ON "inventory_balances" USING btree ("product_id","location_id");--> statement-breakpoint
CREATE INDEX "inventory_balances_location_idx" ON "inventory_balances" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_cycle_count_product_unique" ON "inventory_cycle_count_lines" USING btree ("cycle_count_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_locations_code_unique" ON "inventory_locations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_purchase_order_product_unique" ON "inventory_purchase_order_lines" USING btree ("purchase_order_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_purchase_orders_number_unique" ON "inventory_purchase_orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_purchase_orders_key_unique" ON "inventory_purchase_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_transfers_number_unique" ON "inventory_transfers" USING btree ("transfer_number");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_transfers_idempotency_unique" ON "inventory_transfers" USING btree ("idempotency_key");--> statement-breakpoint
INSERT INTO "inventory_locations" ("name", "code", "type", "is_default")
SELECT 'Default warehouse', 'DEFAULT', 'warehouse', true
WHERE NOT EXISTS (SELECT 1 FROM "inventory_locations" WHERE "is_default" = true);--> statement-breakpoint
INSERT INTO "inventory_balances" ("product_id", "location_id", "available", "average_cost")
SELECT p."id", l."id", p."stock_quantity", p."average_cost"
FROM "storefront_products" p
CROSS JOIN (SELECT "id" FROM "inventory_locations" WHERE "is_default" = true ORDER BY "id" LIMIT 1) l
ON CONFLICT ("product_id", "location_id") DO NOTHING;