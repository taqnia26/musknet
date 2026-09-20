CREATE TYPE "public"."storefront_campaign_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TABLE "storefront_campaign_coupons" (
	"campaign_id" integer NOT NULL,
	"coupon_id" integer NOT NULL,
	CONSTRAINT "storefront_campaign_coupons_campaign_id_coupon_id_pk" PRIMARY KEY("campaign_id","coupon_id")
);
--> statement-breakpoint
CREATE TABLE "storefront_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"status" "storefront_campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storefront_campaign_coupons" ADD CONSTRAINT "storefront_campaign_coupons_campaign_id_storefront_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."storefront_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_campaign_coupons" ADD CONSTRAINT "storefront_campaign_coupons_coupon_id_storefront_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."storefront_coupons"("id") ON DELETE cascade ON UPDATE no action;