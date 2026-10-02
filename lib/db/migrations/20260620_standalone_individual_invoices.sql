BEGIN;

ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS individual boolean NOT NULL DEFAULT false;

ALTER TABLE public.tax_invoices
  DROP CONSTRAINT IF EXISTS invoice_single_channel;

ALTER TABLE public.tax_invoices
  ADD CONSTRAINT invoice_single_channel CHECK (
    (CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN distributor_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN exhibition_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN individual THEN 1 ELSE 0 END) = 1
  );

COMMIT;