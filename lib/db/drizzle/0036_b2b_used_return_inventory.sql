DO $$ BEGIN
  CREATE TYPE "b2b_stock_source" AS ENUM ('normal', 'used_return');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "b2b_return_condition" AS ENUM ('new', 'used');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "gifting_issues"
  ADD COLUMN IF NOT EXISTS "stock_source" "b2b_stock_source" NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "returned_quantity" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "return_condition" "b2b_return_condition",
  ADD COLUMN IF NOT EXISTS "returned_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "gifting_issues"
    ADD CONSTRAINT "gifting_issues_returned_quantity_valid"
    CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "inventory_locations" ("name", "code", "type", "is_default", "active")
VALUES ('B2B Used Returns', 'B2B_USED_RETURN', 'virtual', false, true)
ON CONFLICT ("code") DO UPDATE SET "active" = true;