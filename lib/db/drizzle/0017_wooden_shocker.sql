CREATE TYPE "public"."purchase_receipt_payment_status" AS ENUM('unpaid', 'paid', 'partial');--> statement-breakpoint
CREATE TYPE "public"."purchase_receipt_status" AS ENUM('draft', 'posted', 'voided');--> statement-breakpoint
CREATE TABLE "manufacturing_input_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"material_product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_snapshot" numeric(19, 4) DEFAULT '0' NOT NULL,
	"total_cost" numeric(19, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manufacturing_input_lines_quantity_positive" CHECK ("manufacturing_input_lines"."quantity" > 0),
	CONSTRAINT "manufacturing_input_lines_cost_nonnegative" CHECK ("manufacturing_input_lines"."unit_cost_snapshot" >= 0 and "manufacturing_input_lines"."total_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(19, 4) NOT NULL,
	"total_cost" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipt_lines_quantity_positive" CHECK ("purchase_receipt_lines"."quantity" > 0),
	CONSTRAINT "purchase_receipt_lines_cost_nonnegative" CHECK ("purchase_receipt_lines"."unit_cost" >= 0 and "purchase_receipt_lines"."total_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"vendor_name" text NOT NULL,
	"vendor_reference" text,
	"purchase_id" integer,
	"receipt_date" date NOT NULL,
	"payment_status" "purchase_receipt_payment_status" DEFAULT 'unpaid' NOT NULL,
	"payment_source" text DEFAULT 'company_account' NOT NULL,
	"amount" numeric(19, 4) DEFAULT '0' NOT NULL,
	"status" "purchase_receipt_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"posted_by" integer,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipts_amount_nonnegative" CHECK ("purchase_receipts"."amount" >= 0),
	CONSTRAINT "purchase_receipts_payment_source" CHECK ("purchase_receipts"."payment_source" in ('company_account', 'owner_account'))
);
--> statement-breakpoint
ALTER TABLE "manufacturing_input_lines" ADD CONSTRAINT "manufacturing_input_lines_batch_id_manufacturing_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."manufacturing_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_input_lines" ADD CONSTRAINT "manufacturing_input_lines_material_product_id_storefront_products_id_fk" FOREIGN KEY ("material_product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_posted_by_admin_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manufacturing_input_lines_batch_material_unique" ON "manufacturing_input_lines" USING btree ("batch_id","material_product_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_lines_receipt_idx" ON "purchase_receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_number_unique" ON "purchase_receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "purchase_receipts_date_idx" ON "purchase_receipts" USING btree ("receipt_date");