CREATE TABLE "receivable_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"payment_key" text NOT NULL,
	"payment_date" date NOT NULL,
	"amount" double precision NOT NULL,
	"reference" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_payments_amount_positive" CHECK ("receivable_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "tax_invoices" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_invoice_id_tax_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tax_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_payments_key_unique" ON "receivable_payments" USING btree ("payment_key");--> statement-breakpoint
CREATE INDEX "receivable_payments_invoice_date_idx" ON "receivable_payments" USING btree ("invoice_id","payment_date");