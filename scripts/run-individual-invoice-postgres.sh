#!/usr/bin/env sh
set -eu

for command_name in initdb pg_ctl psql node pnpm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required local PostgreSQL/test command is unavailable: $command_name" >&2
    exit 1
  fi
done
if [ "$(id -u)" -eq 0 ]; then
  echo "Run this isolated invoice test as an unprivileged user." >&2
  exit 1
fi

# Never connect to the workspace or published database, even for schema copies.
unset DATABASE_URL || true
cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/individual-invoice-e2e.XXXXXX")"
data_directory="$cluster_root/data"
socket_directory="$cluster_root/socket"
log_file="$cluster_root/postgres.log"
database_name="individual_invoice_e2e_$(date +%s)_$$"
server_started=false
mkdir -m 700 "$socket_directory"
port="$(
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(server.address().port));
      server.close();
    });
  '
)"

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ "$server_started" = true ]; then
    pg_ctl -D "$data_directory" -m fast -w stop >/dev/null 2>&1 || true
  fi
  if [ "$status" -ne 0 ] && [ -f "$log_file" ]; then
    cat "$log_file" >&2
  fi
  rm -rf "$cluster_root"
  exit "$status"
}
trap cleanup EXIT INT TERM

echo "==> Initializing a fresh isolated PostgreSQL cluster"
initdb -D "$data_directory" --auth=trust --username=runner --no-locale --encoding=UTF8 >/dev/null
pg_ctl -D "$data_directory" -l "$log_file" \
  -o "-h 127.0.0.1 -p $port -k $socket_directory -c listen_addresses=127.0.0.1 -c max_connections=40" \
  -w -t 30 start >/dev/null
server_started=true
database_url="postgresql://runner@127.0.0.1:$port/$database_name"
psql "postgresql://runner@127.0.0.1:$port/postgres" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$database_name\"" >/dev/null

echo "==> Applying schema and accounting integrity to the disposable database only"
# Fresh schema push can emit composite FKs before their referenced unique indexes.
# Export/reorder only for this disposable cluster; never provision workspace/prod here.
DATABASE_URL="$database_url" pnpm --filter @workspace/db exec drizzle-kit export --config ./drizzle.config.ts > "$cluster_root/schema.raw"
node --input-type=module - "$cluster_root/schema.raw" "$cluster_root/schema.sql" <<'NODE'
import fs from "node:fs";
const raw = fs.readFileSync(process.argv[2], "utf8");
const start = raw.search(/^CREATE (?:TYPE|TABLE)\s/m);
if (start < 0) throw new Error("No schema DDL in Drizzle export");
const ddl = raw.slice(start);
const statements = (ddl.includes("--> statement-breakpoint")
  ? ddl.split("--> statement-breakpoint")
  : ddl.split(/;\s*\n(?=(?:CREATE|ALTER)\s)/))
  .map((s) => s.trim().replace(/;$/, "")).filter(Boolean);
const rank = (s) => /^CREATE TYPE/.test(s) ? 0 : /^CREATE TABLE/.test(s) ? 1 : /^CREATE (?:UNIQUE )?INDEX/.test(s) ? 2 : 3;
statements.sort((a, b) => rank(a) - rank(b));
fs.writeFileSync(process.argv[3], `BEGIN;\n${statements.join(";\n")};\nCOMMIT;\n`);
NODE
psql "$database_url" -v ON_ERROR_STOP=1 -f "$cluster_root/schema.sql" >/dev/null
DATABASE_URL="$database_url" pnpm --filter @workspace/db run accounting:integrity
DATABASE_URL="$database_url" pnpm --filter @workspace/db run individual-invoices:install
echo "==> Running standalone individual-invoice PostgreSQL integration tests"
DATABASE_URL="$database_url" \
INDIVIDUAL_INVOICE_POSTGRES_E2E=true \
INDIVIDUAL_INVOICE_E2E_DATABASE="$database_name" \
INDIVIDUAL_INVOICE_E2E_CLUSTER_DIR="$data_directory" \
  pnpm --filter @workspace/api-server exec vitest run "${1:-src/lib/individual-invoices.postgres.test.ts}" --maxWorkers=1