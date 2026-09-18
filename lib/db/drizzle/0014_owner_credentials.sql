CREATE TABLE "owner_credentials" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" integer
);
--> statement-breakpoint
ALTER TABLE "owner_credentials" ADD CONSTRAINT "owner_credentials_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "owner_credentials" ADD CONSTRAINT "owner_credentials_singleton_check" CHECK ("owner_credentials"."id" = 1);