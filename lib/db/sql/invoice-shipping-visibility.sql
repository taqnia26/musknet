-- Additive presentation preference only. Existing invoices default to hidden.
-- Production: owner review and application required.
ALTER TABLE public.tax_invoices
  ADD COLUMN IF NOT EXISTS show_shipping boolean NOT NULL DEFAULT false;
