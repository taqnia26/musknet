CREATE TABLE IF NOT EXISTS "distributor_portal_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "distributor_id" integer NOT NULL REFERENCES "wholesale_distributors"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "distributor_portal_accounts_company_unique" ON "distributor_portal_accounts" USING btree ("distributor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "distributor_portal_accounts_email_unique" ON "distributor_portal_accounts" USING btree ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "distributor_portal_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL REFERENCES "distributor_portal_accounts"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "distributor_portal_sessions_token_unique" ON "distributor_portal_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "distributor_portal_sessions_account_idx" ON "distributor_portal_sessions" USING btree ("account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "distributor_portal_login_attempts" (
  "key_hash" text PRIMARY KEY NOT NULL,
  "failures" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_number" text NOT NULL,
  "distributor_id" integer NOT NULL REFERENCES "wholesale_distributors"("id") ON DELETE RESTRICT,
  "status" text DEFAULT 'pending_review' NOT NULL,
  "idempotency_key" text NOT NULL,
  "contract_id" integer,
  "uploaded_contract_file_id" integer,
  "snapshot_terms" jsonb NOT NULL,
  "snapshot_totals" jsonb NOT NULL,
  "snapshot_fingerprint" text NOT NULL,
  "review_snapshot" jsonb,
  "reviewed_by_admin_id" integer REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "decision_at" timestamp with time zone,
  "decision_reason" text,
  "invoice_id" integer REFERENCES "tax_invoices"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_orders_number_unique" ON "company_orders" USING btree ("order_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_orders_company_key_unique" ON "company_orders" USING btree ("distributor_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_orders_invoice_unique" ON "company_orders" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_orders_company_created_idx" ON "company_orders" USING btree ("distributor_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_orders_status_created_idx" ON "company_orders" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_order_id" integer NOT NULL REFERENCES "company_orders"("id") ON DELETE CASCADE,
  "product_id" integer NOT NULL REFERENCES "storefront_products"("id") ON DELETE RESTRICT,
  "product_name" text NOT NULL,
  "product_name_en" text NOT NULL,
  "sku" text,
  "quantity" integer NOT NULL,
  "unit_price" numeric(14, 2) NOT NULL,
  "subtotal" numeric(14, 2) NOT NULL,
  "vat_amount" numeric(14, 2) NOT NULL,
  "total_amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_order_items_order_idx" ON "company_order_items" USING btree ("company_order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_order_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_order_id" integer NOT NULL REFERENCES "company_orders"("id") ON DELETE RESTRICT,
  "decision" text NOT NULL,
  "actor_admin_id" integer REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text,
  "review_snapshot" jsonb NOT NULL,
  "changes_acknowledged" boolean DEFAULT false NOT NULL
);