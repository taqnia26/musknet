#!/usr/bin/env bash
# Real PostgreSQL schema regression. Never uses an inherited database connection.
set -euo pipefail
unset DATABASE_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
root="$(mktemp -d /tmp/return-schema.XXXXXX)"
started=false
cleanup() {
  if "$started"; then pg_ctl -D "$root/data" -m fast -w stop >/dev/null; fi
  rm -rf "$root"
}
trap cleanup EXIT
mkdir "$root/socket"
initdb -D "$root/data" --auth=trust --username=runner --no-locale --encoding=UTF8 >/dev/null
pg_ctl -D "$root/data" -l "$root/server.log" -o "-h '' -k $root/socket" -w start >/dev/null
started=true
export PGHOST="$root/socket" PGUSER=runner
createdb fresh
createdb upgrade
createdb existing_index
export DATABASE_URL="postgresql://runner@localhost/fresh?host=$root/socket"
pnpm --filter @workspace/db exec drizzle-kit export --config ./drizzle.config.ts > "$root/export.raw"
node --input-type=module - "$root" <<'NODE'
import fs from 'node:fs';
const root=process.argv[2];
const raw=fs.readFileSync(`${root}/export.raw`,'utf8');
const ddl=raw.slice(raw.search(/^CREATE (?:TYPE|TABLE)\s/m));
if (!ddl.startsWith('CREATE ')) throw new Error('No exported DDL');
fs.writeFileSync(`${root}/fresh.sql`,ddl);
// A pre-returns copy of the full schema: no returns objects or composite keys.
const statements=ddl.split(/;\s*\n/).filter(Boolean);
const base=statements.filter(s=>!/\b(?:sales_returns|sales_return_lines)\b/.test(s))
  .map(s=>s.replace(/,\n\s*CONSTRAINT "(?:storefront|company)_order_items_return_source_unique" UNIQUE\([^)]+\)/g,''));
fs.writeFileSync(`${root}/base.sql`,base.join(';\n')+';\n');
// Recreate the previously failing export order, to prove 42830 rather than mocks.
const broken=ddl
  .replace(/,\n\s*CONSTRAINT "storefront_order_items_return_source_unique" UNIQUE\([^)]+\)/,'');
fs.writeFileSync(`${root}/broken.sql`,broken);
NODE
createdb broken
if psql -X -d broken -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f "$root/broken.sql" > "$root/broken.log" 2>&1; then
  echo "Expected missing-key reproduction to fail" >&2; exit 1
fi
grep '42830.*storefront_order_items' "$root/broken.log"
echo "==> Original missing-key failure reproduced"
psql -X -d fresh -v ON_ERROR_STOP=1 -f "$root/fresh.sql" > "$root/fresh.log"
echo "==> Unreordered fresh schema applied successfully"
for db in upgrade existing_index; do
  psql -X -d "$db" -v ON_ERROR_STOP=1 -f "$root/base.sql" > "$root/$db.log"
  if [ "$db" = existing_index ]; then
    psql -X -d "$db" -v ON_ERROR_STOP=1 -c '
      CREATE UNIQUE INDEX storefront_order_items_return_source_unique ON storefront_order_items(id,order_id,product_id);
      CREATE UNIQUE INDEX company_order_items_return_source_unique ON company_order_items(id,company_order_id,product_id);' >> "$root/$db.log"
  fi
  export DATABASE_URL="postgresql://runner@localhost/$db?host=$root/socket"
  # Exercise the real prerequisite used by the deployment push command, twice.
  pnpm --filter @workspace/db run returns:keys
  pnpm --filter @workspace/db run returns:keys
  pnpm --filter @workspace/db exec drizzle-kit push --force --config ./drizzle.config.ts > "$root/push-$db.log" 2>&1
  cat "$root/push-$db.log"
  if grep -Eiq 'error:|42830' "$root/push-$db.log"; then exit 1; fi
done
for db in fresh upgrade existing_index; do
  echo "==> Catalog verification: $db"
  psql -X -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN
    ('sales_return_lines_order_source_fk','sales_return_lines_company_source_fk')
    AND contype='f' AND convalidated) <> 2 THEN
    RAISE EXCEPTION 'Missing or unvalidated source foreign keys';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN
    ('storefront_order_items_return_source_unique','company_order_items_return_source_unique')
    AND contype='u') <> 2 THEN
    RAISE EXCEPTION 'Missing composite UNIQUE constraints';
  END IF;
END $$;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname IN ('storefront_order_items_pkey','storefront_order_items_return_source_unique','sales_return_lines_order_source_fk');
SQL
done
echo "PASS: failure reproduced; fresh schema and both actual Drizzle upgrade paths verified."