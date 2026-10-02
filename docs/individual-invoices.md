# Standalone individual invoices

The **Individual Invoices** page (`/admin/sales/online`) includes both paid website
order invoices and direct individual invoices. Users with `invoices:edit` can
issue a direct invoice without creating an order or shipment.

Direct invoices use catalog products, VAT-inclusive prices at 15%, the shared
invoice numbering/QR settings, and immutable product-name/cost snapshots.
Issuance immediately deducts stock and posts the sale and its cost. Unpaid
invoices create a receivable; collections post separately on their actual
payment date. An identical creation key replays the existing invoice without
duplicating stock or accounting writes.

## Database upgrade

Before running this code against an existing database, run:

```sh
pnpm --filter @workspace/db run individual-invoices:install
pnpm --filter @workspace/db run individual-invoices:verify
```

Run these commands with the intended database configured through the normal
secret/environment setup. They add the default-false individual channel marker
and update the single-channel CHECK constraint without changing existing invoice
data. The normal database `push` commands also run this installer; do not assume
adding the column alone updates an existing CHECK constraint.

This development change does not automatically upgrade a separately hosted
production database. Apply the upgrade as part of that environment's deployment.
Direct invoices are not eligible for the existing company-invoice cancellation
action; a return/correction must not erase an issued invoice or leave stock and
accounting inconsistent.

## Isolated verification

```sh
pnpm run test:individual-invoice:postgres
pnpm run typecheck
```

The PostgreSQL test runner discards any inherited database URL, provisions a
fresh local cluster, and removes it afterward. It does not copy business data or
issue test invoices in the application's database.