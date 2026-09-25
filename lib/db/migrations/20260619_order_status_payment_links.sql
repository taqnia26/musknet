DO $$
DECLARE
  unexpected_statuses text;
  pre_migration_count bigint;
  pre_migration_status_counts text;
BEGIN
  SELECT count(*) INTO pre_migration_count FROM public.storefront_orders;
  SELECT string_agg(format('%s=%s', status, count), ', ' ORDER BY status)
    INTO pre_migration_status_counts
    FROM (SELECT status, count(*) AS count FROM public.storefront_orders GROUP BY status) counts;
  RAISE NOTICE 'Order status migration pre-count: total=%, statuses=%',
    pre_migration_count, COALESCE(pre_migration_status_counts, '(none)');

  SELECT string_agg(COALESCE(status, '<NULL>'), ', ' ORDER BY status)
    INTO unexpected_statuses
    FROM (
      SELECT DISTINCT status
      FROM public.storefront_orders
      WHERE status IS NULL OR status NOT IN (
        'new', 'processing', 'ready', 'completed', 'shipped', 'delivered', 'cancelled',
        'returned', 'pending_review', 'preparing', 'out_for_delivery', 'pending_payment'
      )
    ) invalid;
  IF unexpected_statuses IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing order-status migration: unknown historical storefront_orders.status value(s): %', unexpected_statuses;
  END IF;
END $$;

ALTER TABLE public.storefront_orders DROP CONSTRAINT IF EXISTS storefront_orders_status_check;
UPDATE public.storefront_orders
SET status = CASE status
  WHEN 'new' THEN 'pending_review'
  WHEN 'processing' THEN 'preparing'
  WHEN 'ready' THEN 'preparing'
  WHEN 'shipped' THEN 'out_for_delivery'
  WHEN 'completed' THEN 'delivered'
  WHEN 'delivered' THEN 'delivered'
  WHEN 'cancelled' THEN 'cancelled'
  ELSE status
END
WHERE status IN ('new', 'processing', 'ready', 'shipped', 'completed', 'delivered', 'cancelled');
ALTER TABLE public.storefront_orders ALTER COLUMN status SET DEFAULT 'pending_review';
ALTER TABLE public.storefront_orders
  ADD CONSTRAINT storefront_orders_status_check
  CHECK (status IN ('cancelled', 'returned', 'pending_review', 'preparing', 'out_for_delivery', 'delivered', 'pending_payment')) NOT VALID;
ALTER TABLE public.storefront_orders VALIDATE CONSTRAINT storefront_orders_status_check;

CREATE TABLE IF NOT EXISTS public.storefront_order_payment_links (
  id serial PRIMARY KEY,
  order_id integer NOT NULL,
  provider_invoice_id text,
  payment_url text,
  expires_at timestamptz,
  email_status text NOT NULL DEFAULT 'pending',
  email_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_order_payment_links_order_id_storefront_orders_id_fk
    FOREIGN KEY (order_id) REFERENCES public.storefront_orders(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_order_payment_links_order_id_unique
  ON public.storefront_order_payment_links(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_order_payment_links_provider_invoice_id_unique
  ON public.storefront_order_payment_links(provider_invoice_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.storefront_order_payment_links'::regclass
      AND conname = 'storefront_order_payment_links_email_status_check'
  ) THEN
    ALTER TABLE public.storefront_order_payment_links
      ADD CONSTRAINT storefront_order_payment_links_email_status_check
      CHECK (email_status IN ('pending', 'sent', 'failed')) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.storefront_order_payment_links
  VALIDATE CONSTRAINT storefront_order_payment_links_email_status_check;

DO $$
DECLARE
  post_migration_count bigint;
  post_migration_status_counts text;
BEGIN
  SELECT count(*) INTO post_migration_count FROM public.storefront_orders;
  SELECT string_agg(format('%s=%s', status, count), ', ' ORDER BY status)
    INTO post_migration_status_counts
    FROM (SELECT status, count(*) AS count FROM public.storefront_orders GROUP BY status) counts;
  RAISE NOTICE 'Order status migration post-count: total=%, statuses=%',
    post_migration_count, COALESCE(post_migration_status_counts, '(none)');
END $$;