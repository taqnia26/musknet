-- Additive coupon settings. Review and approve the intended database before running.
BEGIN;
ALTER TABLE storefront_coupons
  ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS per_customer_limit integer,
  ADD COLUMN IF NOT EXISTS max_discount double precision,
  ADD COLUMN IF NOT EXISTS excluded_product_ids jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS allowed_countries jsonb NOT NULL DEFAULT '[]';
-- Existing case-colliding codes must be resolved explicitly, never silently merged.
CREATE UNIQUE INDEX IF NOT EXISTS storefront_coupons_code_ci_unique
  ON storefront_coupons (lower(btrim(code)));
COMMIT;