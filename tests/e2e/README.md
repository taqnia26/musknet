# Project tests

Run every API and Chromium browser test from the project root:

```sh
pnpm test
```

The unified runner downloads the Playwright-pinned Chromium build when it is not
already cached. It creates a uniquely named PostgreSQL database, applies the
schema and accounting integrity rules, runs the API tests, starts isolated API
and storefront processes, runs the browser tests, and removes the processes and
database on exit.

API tests and the accounting browser journey mutate persistent records. They
always receive the generated disposable database URL and never the normal
project database.
The generated database name uses the `musk_ellolo_e2e_` prefix, and cleanup uses
that generated name rather than accepting a database name from user input.

## Individual groups

```sh
pnpm test:api
pnpm test:e2e
pnpm test:e2e:accounting
pnpm test:e2e:home-video
```

## Local and CI requirements

- `DATABASE_URL` must identify a PostgreSQL database whose role may create and
  drop databases. Replit supplies this to the workspace; CI should inject it as
  a secret.
- PostgreSQL client tools (`psql`) and Chromium runtime libraries must be
  installed. They are declared in `.replit` for this workspace.
- CI must allow downloading the pinned Playwright browser on the first run, or
  restore `.cache/ms-playwright` from a cache.
- Do not put database URLs, passwords, or other credentials in scripts, test
  files, command output, or committed environment files.

Optional `E2E_API_PORT` and `E2E_WEB_PORT` variables can override the isolated
local ports when the defaults (`18181` and `18182`) are occupied.