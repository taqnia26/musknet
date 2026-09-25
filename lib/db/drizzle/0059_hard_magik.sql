CREATE TABLE "marketing_social_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"caption" text NOT NULL,
	"platforms" text[] NOT NULL,
	"media_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"campaign_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_social_posts_status_check" CHECK ("marketing_social_posts"."status" IN ('draft', 'scheduled', 'published_manual'))
);
--> statement-breakpoint
ALTER TABLE "marketing_social_posts" ADD CONSTRAINT "marketing_social_posts_campaign_id_storefront_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."storefront_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_social_posts" ADD CONSTRAINT "marketing_social_posts_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_social_posts_schedule_idx" ON "marketing_social_posts" USING btree ("status","scheduled_at");