CREATE TABLE IF NOT EXISTS "storefront_influencers" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "image_url" text,
  "referral_code" text NOT NULL,
  "commission_rate" double precision DEFAULT 10 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_influencer_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "influencer_id" integer NOT NULL REFERENCES "storefront_influencers"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_influencer_visits" (
  "id" serial PRIMARY KEY NOT NULL,
  "influencer_id" integer NOT NULL REFERENCES "storefront_influencers"("id") ON DELETE cascade,
  "visitor_key" text NOT NULL,
  "landing_path" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_influencer_coupons" (
  "influencer_id" integer NOT NULL REFERENCES "storefront_influencers"("id") ON DELETE cascade,
  "coupon_id" integer NOT NULL REFERENCES "storefront_coupons"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_order_attributions" (
  "order_id" integer PRIMARY KEY NOT NULL REFERENCES "storefront_orders"("id") ON DELETE cascade,
  "influencer_id" integer NOT NULL REFERENCES "storefront_influencers"("id") ON DELETE restrict,
  "source" text NOT NULL,
  "commission_rate" double precision NOT NULL,
  "commission_amount" double precision NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "influencers_email_unique" ON "storefront_influencers" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "influencers_referral_unique" ON "storefront_influencers" ("referral_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "influencer_sessions_token_unique" ON "storefront_influencer_sessions" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "influencer_coupon_unique" ON "storefront_influencer_coupons" ("influencer_id","coupon_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "influencer_coupon_owner_unique" ON "storefront_influencer_coupons" ("coupon_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "influencer_visits_influencer_created" ON "storefront_influencer_visits" ("influencer_id","created_at");