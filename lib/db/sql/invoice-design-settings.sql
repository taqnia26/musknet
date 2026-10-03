-- Target: development database only. Additive, feature-scoped SQL.
-- No invoice, order, ledger, or existing billing data is modified.
BEGIN;
CREATE TABLE IF NOT EXISTS invoice_design_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  draft jsonb,
  published jsonb,
  updated_by integer REFERENCES admin_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_by integer REFERENCES admin_users(id),
  published_at timestamptz
);
INSERT INTO invoice_design_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
COMMIT;