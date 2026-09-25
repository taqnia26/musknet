CREATE TABLE "storefront_order_payment_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"provider_invoice_id" text,
	"payment_url" text,
	"expires_at" timestamp with time zone,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"email_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_order_payment_links_email_status_check" CHECK ("storefront_order_payment_links"."email_status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "storefront_orders" ALTER COLUMN "status" SET DEFAULT 'pending_review';--> statement-breakpoint
ALTER TABLE "storefront_products" ADD COLUMN "inventory_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_order_payment_links" ADD CONSTRAINT "storefront_order_payment_links_order_id_storefront_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."storefront_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_order_payment_links_order_id_unique" ON "storefront_order_payment_links" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_order_payment_links_provider_invoice_id_unique" ON "storefront_order_payment_links" USING btree ("provider_invoice_id");--> statement-breakpoint
ALTER TABLE "storefront_orders" ADD CONSTRAINT "storefront_orders_status_check" CHECK ("storefront_orders"."status" in ('cancelled', 'returned', 'pending_review', 'preparing', 'out_for_delivery', 'delivered', 'pending_payment'));