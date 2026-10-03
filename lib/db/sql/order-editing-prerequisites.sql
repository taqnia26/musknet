-- Additive prerequisites for the existing order-editing code in this workspace.
-- NOT approved/applied to the project database by the invoice-design task.
-- Review the intended database and obtain explicit approval before running there.
-- Tested only against a disposable local PostgreSQL cluster. No business data updates.
BEGIN;
ALTER TABLE storefront_orders ADD COLUMN IF NOT EXISTS admin_edit_snapshot jsonb;
ALTER TABLE company_orders ADD COLUMN IF NOT EXISTS admin_edit_snapshot jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storefront_orders'::regclass AND conname='storefront_orders_admin_edit_snapshot_check') THEN
    ALTER TABLE storefront_orders ADD CONSTRAINT storefront_orders_admin_edit_snapshot_check
      CHECK (admin_edit_snapshot IS NULL OR jsonb_typeof(admin_edit_snapshot)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='company_orders'::regclass AND conname='company_orders_admin_edit_snapshot_check') THEN
    ALTER TABLE company_orders ADD CONSTRAINT company_orders_admin_edit_snapshot_check
      CHECK (admin_edit_snapshot IS NULL OR jsonb_typeof(admin_edit_snapshot)='object');
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS order_edit_audits (
  id serial PRIMARY KEY,
  order_id integer,
  company_order_id integer,
  request_key text NOT NULL,
  actor_id integer NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  CONSTRAINT order_edit_audits_request_key_unique UNIQUE (request_key),
  CONSTRAINT order_edit_audits_order_id_storefront_orders_id_fk FOREIGN KEY (order_id) REFERENCES storefront_orders(id) ON DELETE RESTRICT,
  CONSTRAINT order_edit_audits_company_order_id_company_orders_id_fk FOREIGN KEY (company_order_id) REFERENCES company_orders(id) ON DELETE RESTRICT,
  CONSTRAINT order_edit_audits_actor_id_admin_users_id_fk FOREIGN KEY (actor_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  CONSTRAINT order_edit_audits_request_key_check CHECK (length(request_key) BETWEEN 16 AND 200),
  CONSTRAINT order_edit_audits_before_snapshot_check CHECK (jsonb_typeof(before_snapshot)='object'),
  CONSTRAINT order_edit_audits_after_snapshot_check CHECK (jsonb_typeof(after_snapshot)='object'),
  CONSTRAINT order_edit_audits_check CHECK ((order_id IS NOT NULL)::integer + (company_order_id IS NOT NULL)::integer = 1)
);
CREATE INDEX IF NOT EXISTS order_edit_audits_order_idx ON order_edit_audits(order_id,edited_at);
CREATE INDEX IF NOT EXISTS order_edit_audits_company_order_idx ON order_edit_audits(company_order_id,edited_at);
COMMIT;