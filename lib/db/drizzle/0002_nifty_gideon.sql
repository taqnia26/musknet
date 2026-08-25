ALTER TABLE "storefront_carts" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_carts" ADD COLUMN "guest_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_carts_guest_token_unique" ON "storefront_carts" USING btree ("guest_token");--> statement-breakpoint
ALTER TABLE "storefront_carts" ADD CONSTRAINT "storefront_carts_owner_check" CHECK ((user_id is not null) <> (guest_token is not null));