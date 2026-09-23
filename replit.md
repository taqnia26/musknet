# Musk Ellolo Storefront

Arabic-first luxury fragrance storefront for Musk Ellolo, with a public product catalog, cart, OTP sign-in, customer account, and checkout flow.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/musk-ellolo/` — React/Vite public storefront.
- `artifacts/api-server/src/routes/storefront.ts` — public storefront API.
- `artifacts/api-server/src/lib/storefront.ts` — development catalog, checkout, and OTP provider abstraction data.
- `lib/api-spec/openapi.yaml` — API contract and generated client source.
- `attached_assets/` — supplied product photography and official brand guide.

## Architecture decisions

- The public shopping surface is built before any admin UI, by product direction.
- OTP, payments, and shipping use development-safe behaviour now; their frontend and API contracts are ready to be swapped for provider-backed implementations when credentials are supplied.
- The supplied product images are served from the API at `/api/media` so the catalog can use the same paths in development and deployment.

## Product

- Bilingual RTL/LTR browsing for perfumes and hair mists.
- All customer-facing and admin numbers use English digits (0–9) in either interface language; amounts and counts use English number separators. Keep Arabic labels and month names localized, and use the shared number formatters for new UI.
- Product details, cart, discount-code validation, delivery quote, checkout, phone OTP, orders, profile, and saved addresses.

## User preferences

- In admin tables and record cards, place per-record actions (view, edit, delete, archive, status changes, and similar actions) inside an accessible three-dot menu. Do not scatter action buttons across rows. Keep create/global controls and inline form Save/Cancel outside the menu.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
