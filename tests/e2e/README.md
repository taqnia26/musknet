# Accounting browser test

The accounting journey mutates immutable financial records, so it intentionally
refuses to run against the normal Replit development database.

Provide all three variables:

- `E2E_BASE_URL`: a CI-provided instance of the storefront and API.
- `E2E_DATABASE_URL`: the dedicated PostgreSQL database used by that instance.
- `E2E_DISPOSABLE_DATABASE=true`: explicit confirmation that test-created
  accounting and audit records may be removed.

`E2E_DATABASE_URL` must differ from the workspace's normal `DATABASE_URL`. The
test provisions unique users in the isolated database, verifies that the target
service can authenticate them (which also confirms both sides use the same
database), and removes all records it created even after a failed browser step.

Run with:

```sh
pnpm test:e2e:accounting
```