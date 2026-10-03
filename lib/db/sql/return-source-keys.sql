-- Additive prerequisite for sales-return foreign keys.
-- Run before Drizzle push on an existing database. Does not change business rows.
DO $$
DECLARE
  source_table text;
  source_key text;
  parent_column text;
  actual_columns text[];
BEGIN
  FOR source_table, source_key, parent_column IN VALUES
    ('storefront_order_items', 'storefront_order_items_return_source_unique', 'order_id'),
    ('company_order_items', 'company_order_items_return_source_unique', 'company_order_id')
  LOOP
    -- On an empty database the schema creates these UNIQUE constraints inline.
    IF to_regclass('public.' || source_table) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass('public.' || source_table) AND conname = source_key
    ) THEN
      IF to_regclass('public.' || source_key) IS NOT NULL THEN
        -- Adopt the previous unique index without dropping it or dependent FKs.
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE USING INDEX %I',
          source_table, source_key, source_key);
      ELSE
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (id, %I, product_id)',
          source_table, source_key, parent_column);
      END IF;
    END IF;
    SELECT array_agg(a.attname::text ORDER BY k.ordinality)
      INTO actual_columns
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
      WHERE c.conrelid=to_regclass('public.' || source_table)
        AND c.conname=source_key AND c.contype='u' AND NOT c.condeferrable;
    IF actual_columns IS DISTINCT FROM ARRAY['id',parent_column,'product_id'] THEN
      RAISE EXCEPTION 'Unexpected definition for %.%; refusing migration', source_table, source_key;
    END IF;
  END LOOP;
END $$;