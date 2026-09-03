CREATE TABLE "storefront_page_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_key" text NOT NULL,
	"path" text NOT NULL,
	"referrer" text,
	"source" text DEFAULT 'direct' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "storefront_page_views_created_idx" ON "storefront_page_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "storefront_page_views_session_created_idx" ON "storefront_page_views" USING btree ("session_key","created_at");--> statement-breakpoint
CREATE INDEX "storefront_page_views_source_created_idx" ON "storefront_page_views" USING btree ("source","created_at");