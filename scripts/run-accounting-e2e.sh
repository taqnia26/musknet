#!/usr/bin/env sh
set -eu

exec sh scripts/run-browser-e2e.sh tests/e2e/accounting.spec.ts "$@"