CREATE TABLE "annual_agenda_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"note" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annual_agenda_event_dates_valid" CHECK ("annual_agenda_events"."end_date" >= "annual_agenda_events"."start_date"),
	CONSTRAINT "annual_agenda_event_type_valid" CHECK ("annual_agenda_events"."type" in ('exhibition', 'occasion', 'holiday', 'launch', 'other')),
	CONSTRAINT "annual_agenda_event_recurrence_valid" CHECK ("annual_agenda_events"."recurrence" in ('none', 'annual_gregorian')),
	CONSTRAINT "annual_agenda_exhibitions_manual" CHECK ("annual_agenda_events"."type" <> 'exhibition' or "annual_agenda_events"."recurrence" = 'none')
);
--> statement-breakpoint
CREATE TABLE "production_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"category" text NOT NULL,
	"product_type" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"target_launch_date" date,
	"target_production_date" date,
	"planned_quantity" integer NOT NULL,
	"manufacturing_country" text NOT NULL,
	"factory" text NOT NULL,
	"estimated_cost" numeric(19, 4) NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone,
	"secured_at" timestamp with time zone,
	"secured_by" integer,
	"funding_note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_plans_quantity_positive" CHECK ("production_plans"."planned_quantity" > 0),
	CONSTRAINT "production_plans_cost_nonnegative" CHECK ("production_plans"."estimated_cost" >= 0),
	CONSTRAINT "production_plans_priority_valid" CHECK ("production_plans"."priority" IN ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "production_plans_status_valid" CHECK ("production_plans"."status" IN ('future', 'planning', 'under_review', 'approved', 'scheduled', 'in_production', 'completed', 'on_hold', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "manufacturing_batches" ADD COLUMN "production_plan_id" integer;--> statement-breakpoint
ALTER TABLE "annual_agenda_events" ADD CONSTRAINT "annual_agenda_events_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_product_id_storefront_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."storefront_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_secured_by_admin_users_id_fk" FOREIGN KEY ("secured_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_plans_status_idx" ON "production_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_plans_product_idx" ON "production_plans" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "manufacturing_batches" ADD CONSTRAINT "manufacturing_batches_production_plan_id_production_plans_id_fk" FOREIGN KEY ("production_plan_id") REFERENCES "public"."production_plans"("id") ON DELETE set null ON UPDATE no action;