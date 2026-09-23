CREATE TABLE "billing_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"invoice_email" text,
	"company_name" text,
	"street_address" text,
	"city" text,
	"country" text,
	"tax_number" text,
	"bank_name" text,
	"account_holder" text,
	"account_number" text,
	"iban" text,
	"preferred_payment_method" text DEFAULT 'not_set' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;