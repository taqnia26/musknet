CREATE TYPE "public"."storefront_inventory_movement_type" AS ENUM('increase', 'decrease', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'on_leave');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('annual', 'sick', 'emergency', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."payroll_payment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('rent', 'salaries', 'utilities', 'marketing', 'shipping', 'other');--> statement-breakpoint
CREATE TYPE "public"."financial_period_status" AS ENUM('draft', 'closed');--> statement-breakpoint
CREATE TYPE "public"."manufacturing_batch_status" AS ENUM('in_production', 'completed', 'quality_check', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."exhibition_status" AS ENUM('planned', 'ongoing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"movement_type" "storefront_inventory_movement_type" NOT NULL,
	"quantity_change" integer NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"reason" text,
	"performed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"check_in_time" time,
	"check_out_time" time,
	"status" "attendance_status" NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"national_id" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"position" text NOT NULL,
	"department" text NOT NULL,
	"salary" double precision NOT NULL,
	"hire_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"admin_user_id" integer,
	CONSTRAINT "employees_salary_nonnegative" CHECK ("employees"."salary" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"approved_by" integer,
	CONSTRAINT "leave_dates_valid" CHECK ("leave_requests"."end_date" >= "leave_requests"."start_date")
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"base_salary" double precision NOT NULL,
	"deductions" double precision NOT NULL,
	"bonuses" double precision NOT NULL,
	"net_salary" double precision NOT NULL,
	"payment_date" date,
	"payment_status" "payroll_payment_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "payroll_month_valid" CHECK ("payroll_records"."month" between 1 and 12),
	CONSTRAINT "payroll_year_valid" CHECK ("payroll_records"."year" between 1900 and 2200),
	CONSTRAINT "payroll_amounts_nonnegative" CHECK ("payroll_records"."base_salary" >= 0 and "payroll_records"."deductions" >= 0 and "payroll_records"."bonuses" >= 0 and "payroll_records"."net_salary" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" double precision NOT NULL,
	"description" text NOT NULL,
	"expense_date" date NOT NULL,
	"receipt_url" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_revenue" double precision NOT NULL,
	"total_expenses" double precision NOT NULL,
	"net_profit" double precision NOT NULL,
	"status" "financial_period_status" DEFAULT 'draft' NOT NULL,
	CONSTRAINT "financial_period_dates_valid" CHECK ("financial_periods"."period_end" >= "financial_periods"."period_start"),
	CONSTRAINT "financial_period_totals_nonnegative" CHECK ("financial_periods"."total_revenue" >= 0 and "financial_periods"."total_expenses" >= 0)
);
--> statement-breakpoint
CREATE TABLE "manufacturing_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_number" text NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_produced" integer NOT NULL,
	"production_date" date NOT NULL,
	"expiry_date" date,
	"cost_per_unit" double precision NOT NULL,
	"status" "manufacturing_batch_status" NOT NULL,
	CONSTRAINT "manufacturing_quantity_positive" CHECK ("manufacturing_batches"."quantity_produced" > 0),
	CONSTRAINT "manufacturing_cost_nonnegative" CHECK ("manufacturing_batches"."cost_per_unit" >= 0),
	CONSTRAINT "manufacturing_dates_valid" CHECK ("manufacturing_batches"."expiry_date" is null or "manufacturing_batches"."expiry_date" >= "manufacturing_batches"."production_date")
);
--> statement-breakpoint
CREATE TABLE "exhibition_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"exhibition_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_allocated" integer NOT NULL,
	"quantity_sold" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exhibition_product_quantities_valid" CHECK ("exhibition_products"."quantity_allocated" >= 0 and "exhibition_products"."quantity_sold" >= 0 and "exhibition_products"."quantity_sold" <= "exhibition_products"."quantity_allocated")
);
--> statement-breakpoint
CREATE TABLE "exhibitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"budget" double precision NOT NULL,
	"status" "exhibition_status" NOT NULL,
	"notes" text,
	CONSTRAINT "exhibition_dates_valid" CHECK ("exhibitions"."end_date" >= "exhibitions"."start_date"),
	CONSTRAINT "exhibition_budget_nonnegative" CHECK ("exhibitions"."budget" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tax_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"sequence_number" integer NOT NULL,
	"invoice_number" text NOT NULL,
	"seller_name" text NOT NULL,
	"issue_datetime" timestamp with time zone NOT NULL,
	"seller_vat_number" text NOT NULL,
	"subtotal" double precision NOT NULL,
	"vat_amount" double precision NOT NULL,
	"total_amount" double precision NOT NULL,
	"qr_code_data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storefront_orders" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "storefront_orders" ADD COLUMN "coupon_discount_type" "storefront_coupon_discount_type";--> statement-breakpoint
ALTER TABLE "storefront_orders" ADD COLUMN "coupon_discount_value" double precision;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_admin_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_admin_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_batches" ADD CONSTRAINT "manufacturing_batches_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibition_products" ADD CONSTRAINT "exhibition_products_exhibition_id_exhibitions_id_fk" FOREIGN KEY ("exhibition_id") REFERENCES "public"."exhibitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exhibition_products" ADD CONSTRAINT "exhibition_products_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_order_id_storefront_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."storefront_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employee_date_unique" ON "attendance_records" USING btree ("employee_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_national_id_unique" ON "employees" USING btree ("national_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_employee_period_unique" ON "payroll_records" USING btree ("employee_id","month","year");--> statement-breakpoint
CREATE UNIQUE INDEX "manufacturing_batch_number_unique" ON "manufacturing_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "exhibition_product_unique" ON "exhibition_products" USING btree ("exhibition_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_id_unique" ON "tax_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_sequence_number_unique" ON "tax_invoices" USING btree ("sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_unique" ON "tax_invoices" USING btree ("invoice_number");