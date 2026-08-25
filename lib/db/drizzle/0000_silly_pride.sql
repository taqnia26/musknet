CREATE TABLE "storefront_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "storefront_otp_records" (
	"phone" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"street" text NOT NULL,
	"building_no" text NOT NULL,
	"additional_info" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_number" text NOT NULL,
	"subtotal" double precision NOT NULL,
	"shipping_cost" double precision NOT NULL,
	"discount" double precision NOT NULL,
	"tax" double precision NOT NULL,
	"total" double precision NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"tracking_number" text,
	"address_json" text NOT NULL,
	"shipping_method" text NOT NULL,
	"payment_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" double precision NOT NULL,
	"total_price" double precision NOT NULL,
	"image_url" text
);
--> statement-breakpoint
ALTER TABLE "storefront_carts" ADD CONSTRAINT "storefront_carts_user_id_storefront_customers_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."storefront_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_cart_items" ADD CONSTRAINT "storefront_cart_items_cart_id_storefront_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."storefront_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_addresses" ADD CONSTRAINT "storefront_addresses_user_id_storefront_customers_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."storefront_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_orders" ADD CONSTRAINT "storefront_orders_user_id_storefront_customers_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."storefront_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_order_items" ADD CONSTRAINT "storefront_order_items_order_id_storefront_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."storefront_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_carts_user_id_unique" ON "storefront_carts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_cart_items_cart_product_unique" ON "storefront_cart_items" USING btree ("cart_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_orders_order_number_unique" ON "storefront_orders" USING btree ("order_number");