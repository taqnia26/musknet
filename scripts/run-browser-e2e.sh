#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to provision a disposable E2E database." >&2
  exit 1
fi

case "${E2E_DISPOSABLE_DATABASE:-true}" in
  true) ;;
  *)
    echo "E2E_DISPOSABLE_DATABASE must be true; browser tests require a disposable database." >&2
    exit 1
    ;;
esac

api_port="${E2E_API_PORT:-18181}"
web_port="${E2E_WEB_PORT:-18182}"
mode="${E2E_MODE:-browser}"
database_name="musk_ellolo_e2e_$(date +%s)_$$"
log_dir="${TMPDIR:-/tmp}/musk-ellolo-e2e-$$"
api_pid=""
web_pid=""
database_created=false

mkdir -p "$log_dir"

case "$mode" in
  api|browser) ;;
  *)
    echo "E2E_MODE must be either api or browser." >&2
    exit 1
    ;;
esac

e2e_database_url="$(
  E2E_DATABASE_NAME="$database_name" node -e '
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${process.env.E2E_DATABASE_NAME}`;
    process.stdout.write(url.toString());
  '
)"

cleanup() {
  status=$?
  trap - EXIT INT TERM
  [ -z "$web_pid" ] || kill "$web_pid" 2>/dev/null || true
  [ -z "$api_pid" ] || kill "$api_pid" 2>/dev/null || true
  [ -z "$web_pid" ] || wait "$web_pid" 2>/dev/null || true
  [ -z "$api_pid" ] || wait "$api_pid" 2>/dev/null || true
  if [ "$database_created" = true ]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"$database_name\" WITH (FORCE)" >/dev/null ||
      echo "Warning: could not remove disposable database $database_name" >&2
  fi
  if [ "$status" -ne 0 ]; then
    echo "E2E service logs are available in $log_dir" >&2
  else
    rm -rf "$log_dir"
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM

wait_for_url() {
  url=$1
  pid=$2
  name=$3
  attempts=0
  while [ "$attempts" -lt 120 ]; do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name stopped before becoming ready." >&2
      return 1
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  echo "Timed out waiting for $name at $url." >&2
  return 1
}

echo "==> Installing the pinned Chromium build if needed"
pnpm exec playwright install chromium

echo "==> Creating disposable E2E database"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$database_name\"" >/dev/null
database_created=true

echo "==> Applying schema and database integrity rules"
DATABASE_URL="$e2e_database_url" pnpm --filter @workspace/db run push >/dev/null

if [ "$mode" = api ] || [ "${E2E_RUN_API_TESTS:-false}" = true ]; then
  echo "==> Running API tests against the disposable database"
  DATABASE_URL="$e2e_database_url" pnpm run test:api:raw
fi

if [ "$mode" = api ]; then
  echo "==> Complete API test suite passed"
  exit 0
fi

echo "==> Building and starting isolated E2E services"
pnpm --filter @workspace/api-server run build >/dev/null
DATABASE_URL="$e2e_database_url" PORT="$api_port" NODE_ENV=test \
  pnpm --filter @workspace/api-server run start >"$log_dir/api.log" 2>&1 &
api_pid=$!
wait_for_url "http://127.0.0.1:$api_port/api/healthz" "$api_pid" "E2E API"

PORT="$web_port" BASE_PATH="/" E2E_API_URL="http://127.0.0.1:$api_port" \
  pnpm --filter @workspace/musk-ellolo run dev >"$log_dir/web.log" 2>&1 &
web_pid=$!
wait_for_url "http://127.0.0.1:$web_port/" "$web_pid" "E2E storefront"

echo "==> Running Chromium browser tests"
DATABASE_URL="$e2e_database_url" \
E2E_DATABASE_URL="$e2e_database_url" \
E2E_DISPOSABLE_DATABASE=true \
E2E_BASE_URL="http://127.0.0.1:$web_port" \
  pnpm exec playwright test "$@"

if [ "${E2E_RUN_API_TESTS:-false}" = true ]; then
  echo "==> Complete API and browser test suite passed"
else
  echo "==> Requested browser test suite passed"
fi