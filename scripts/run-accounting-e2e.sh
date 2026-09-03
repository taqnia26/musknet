#!/usr/bin/env sh
set -eu

if [ -z "${E2E_BASE_URL:-}" ]; then
  echo "E2E_BASE_URL must point to a service configured with E2E_DATABASE_URL." >&2
  exit 1
fi

if [ -z "${E2E_DATABASE_URL:-}" ]; then
  echo "E2E_DATABASE_URL is required; accounting E2E tests never use the normal project database." >&2
  exit 1
fi

if [ "${E2E_DISPOSABLE_DATABASE:-}" != "true" ]; then
  echo "Set E2E_DISPOSABLE_DATABASE=true only for a dedicated database whose test data may be deleted." >&2
  exit 1
fi

if [ -n "${DATABASE_URL:-}" ] && [ "$E2E_DATABASE_URL" = "$DATABASE_URL" ]; then
  echo "E2E_DATABASE_URL must differ from the normal project DATABASE_URL." >&2
  exit 1
fi

export DATABASE_URL="$E2E_DATABASE_URL"
exec playwright test tests/e2e/accounting.spec.ts "$@"