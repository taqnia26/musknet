CREATE TABLE "purchase_receipt_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"payment_key" text NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"payment_source" text NOT NULL,
	"payment_reference" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipt_payments_amount_positive" CHECK ("purchase_receipt_payments"."amount" > 0),
	CONSTRAINT "purchase_receipt_payments_source" CHECK ("purchase_receipt_payments"."payment_source" in ('company_account', 'owner_account'))
);
--> statement-breakpoint
ALTER TABLE "purchase_receipt_payments" ADD CONSTRAINT "purchase_receipt_payments_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_payments" ADD CONSTRAINT "purchase_receipt_payments_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipt_payments_key_unique" ON "purchase_receipt_payments" USING btree ("payment_key");--> statement-breakpoint
CREATE INDEX "purchase_receipt_payments_receipt_idx" ON "purchase_receipt_payments" USING btree ("receipt_id");