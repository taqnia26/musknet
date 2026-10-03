# Sales-return source-key migration

## Failure

The generated schema previously added this FK before creating its supporting
unique index:

```sql
ALTER TABLE "sales_return_lines"
  ADD CONSTRAINT "sales_return_lines_order_source_fk"
  FOREIGN KEY ("order_item_id", "order_id", "product_id")
  REFERENCES "public"."storefront_order_items" ("id", "order_id", "product_id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
```

`PRIMARY KEY (id)` alone is not a matching referenced key for this three-column FK.
The company-order equivalent also needs a unique key on
`company_order_items(id, company_order_id, product_id)`.

## Correction

Both keys are now declared as UNIQUE constraints so fresh exports create them
inside CREATE TABLE, before FK creation. This alone does not fix Drizzle's upgrade
ordering. The database package's push commands therefore run `returns:keys` first.
The prerequisite creates missing constraints or adopts the existing unique indexes
without dropping them. It verifies the columns, runs transactionally, and stops on
errors. It changes no business rows.

For a separately hosted database, review the intended database and approve the
scoped prerequisite before running it:

```sh
pnpm --filter @workspace/db run returns:keys
```

This is not authorization to run a broad schema push or to change production.
Direct `drizzle-kit push` bypasses the prerequisite and must not be used for an
existing-schema upgrade without first establishing the keys. A previously failed
push may have partially applied other statements; inspect its remaining diff.

## Real PostgreSQL regression

```sh
bash scripts/test-return-schema-postgres.sh
```

Uses a disposable local PostgreSQL cluster, clears inherited database settings,
and deletes only that temporary cluster afterward. No mocks or business database
connections. Covers:

1. Reproduction of SQLSTATE 42830 when the referenced key is absent.
2. Application of the full fresh schema export without DDL reordering.
3. Actual Drizzle upgrade from a pre-returns schema with only the source-table PKs.
4. Actual Drizzle upgrade from a schema with the previous composite unique indexes.
5. Repeated prerequisite installation and catalog verification of both source FKs.

## Read-only verification on the intended server

```sql
SELECT c.conname, c.contype, c.convalidated, pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE c.conrelid = 'public.storefront_order_items'::regclass
  AND c.contype IN ('p', 'u');

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'storefront_order_items';

SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = to_regclass('public.sales_return_lines')
  AND conname IN (
    'sales_return_lines_order_source_fk',
    'sales_return_lines_company_source_fk'
  );
```

The accessible workspace database was inspected read-only: it has
`storefront_order_items_pkey PRIMARY KEY (id)` and the standalone unique index
`storefront_order_items_return_source_unique (id, order_id, product_id)`.
It was not migrated. These observations do not establish the private server's state.