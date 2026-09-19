ALTER TABLE "purchase_receipts" ADD COLUMN "paid_amount" numeric(19, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "payment_reference" text;