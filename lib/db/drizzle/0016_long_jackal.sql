CREATE TYPE "public"."opening_balance_mapping_state" AS ENUM('mapped', 'unmapped', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."opening_balance_status" AS ENUM('draft', 'review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."operation_kind" AS ENUM('opening_balance', 'purchase_receipt', 'manufacturing_consumption', 'manufacturing_output', 'sale_fulfillment', 'liability', 'payment');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('pending', 'posted', 'reversed');--> statement-breakpoint
CREATE TABLE "opening_balance_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_key" text NOT NULL,
	"source_file_name" text NOT NULL,
	"source_sheet" text NOT NULL,
	"valuation_method" text DEFAULT 'weighted_average' NOT NULL,
	"status" "opening_balance_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_balance_imports_valuation_method" CHECK ("opening_balance_imports"."valuation_method" = 'weighted_average'),
	CONSTRAINT "opening_balance_imports_approval_audit" CHECK (("opening_balance_imports"."status" <> 'approved') or ("opening_balance_imports"."approved_by" is not null and "opening_balance_imports"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "opening_balance_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"source_row" integer NOT NULL,
	"source_label" text NOT NULL,
	"source_quantity" numeric(19, 4) NOT NULL,
	"opening_quantity" integer NOT NULL,
	"full_batch_unit_cost" numeric(19, 4) NOT NULL,
	"opening_value" numeric(19, 4) NOT NULL,
	"product_id" integer,
	"mapping_state" "opening_balance_mapping_state" DEFAULT 'unmapped' NOT NULL,
	"mapping_note" text,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_balance_lines_quantity_nonnegative" CHECK ("opening_balance_lines"."opening_quantity" >= 0 and "opening_balance_lines"."source_quantity" >= 0),
	CONSTRAINT "opening_balance_lines_cost_nonnegative" CHECK ("opening_balance_lines"."full_batch_unit_cost" >= 0 and "opening_balance_lines"."opening_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "operation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"kind" "operation_kind" NOT NULL,
	"status" "operation_status" DEFAULT 'pending' NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "average_cost" numeric(19, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "unit_cost" numeric(19, 4);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "total_cost" numeric(19, 4);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "event_key" text;--> statement-breakpoint
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_import_id_opening_balance_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."opening_balance_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_balance_lines" ADD CONSTRAINT "opening_balance_lines_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opening_balance_imports_key_unique" ON "opening_balance_imports" USING btree ("import_key");--> statement-breakpoint
CREATE INDEX "opening_balance_lines_import_idx" ON "opening_balance_lines" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_events_event_key_unique" ON "operation_events" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_events_source_unique" ON "operation_events" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "operation_events_kind_date_idx" ON "operation_events" USING btree ("kind","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_event_key_unique" ON "inventory_movements" USING btree ("event_key") WHERE "inventory_movements"."event_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "influencer_coupon_owner_unique" ON "storefront_influencer_coupons" USING btree ("coupon_id");