CREATE TABLE "invoice_email_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error_message" text,
	"sent_by_admin_id" integer NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_invoice_id_tax_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tax_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_sent_by_admin_id_admin_users_id_fk" FOREIGN KEY ("sent_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_email_deliveries_invoice_attempted_idx" ON "invoice_email_deliveries" USING btree ("invoice_id","attempted_at");