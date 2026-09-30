# ShipHero integration: built, not activated

Live Create Order / Create Product traffic is deliberately disabled until the
partner's Create Order example and the unresolved field contracts are reviewed.
Adding environment variables or saving administrator settings cannot enable it.
No ShipHero request was made while building or testing this integration.

## Configuration

Read at call time, from environment variables only:

- `SHIPHERO_ACCESS_TOKEN` — direct access token, or use the refresh token below.
- `SHIPHERO_REFRESH_TOKEN` — optional alternative to the direct access token.
- `SHIPHERO_MERCHANT_ID`
- `SHIPHERO_WAREHOUSE_ID`
- `SHIPHERO_WEBHOOK_SECRET`

Never place these values in the administrator settings, product mappings, logs,
or database. The administrator panel saves only confirmed shipping codes,
cold-chain cities, product names/SKUs, and forward status mappings.
Initial product mappings and shipping-code configuration are empty.

The public GraphQL draft uses customer_account_id for the merchant field.
This mapping and the public Warehouse ID type must be confirmed with the partner.
Address 2 is a clearly marked `---SHORTCODE` test fixture, **not** a live address
format. It must be replaced with the partner-approved example before activation.

## Order and product safety

- Order creation/review does not send anything. Entering `preparing` records
  a durable outbox job in the same transaction as the status change.
- Sending also requires a paid order, complete confirmed product mappings,
  the applicable confirmed shipping code, and configured cold-city coverage.
- One dispatch is allowed per local order ID and unique order number.
- A timeout, process interruption, unknown post-start exception, or failure
  saving a successful result must be reconciled, never blindly re-created.
- The installation catalog baseline protects the existing products from
  Create Product. Only later products marked new and explicitly confirmed
  as not registered can reach that operation.
- Registered or uncertain product identities cannot be edited or deleted.

## Webhooks

Receiver: `POST /api/webhooks/shiphero` (public endpoint, authenticated by HMAC).

`x-shiphero-hmac-sha256` is the canonical base64 SHA-256 HMAC of the original,
unmodified request bytes. `X-Shiphero-Message-ID` is mandatory.
The inbox row is durable before acknowledgement; concurrent replays are no-ops.
The accepted response is `{"code":"200","Status":"Success"}`.
HEAD probes also require a configured secret and a valid HMAC of the empty body.
Unsigned registration probes are intentionally not an authentication exception;
confirm the partner's registration procedure before activation.

Unknown event types are stored and marked unrecognized. A status update requires
an explicit confirmed mapping, verified dispatch identity, and a timestamp with
a timezone. Statuses move forward only, and newer staff status changes win.
Cancellation/return events require the existing financial workflow and are not
performed by this receiver.

**Inventory/stock/quantity events are stored but inert.** No zero-sync, stock
adjustment, or COGS journal is performed by the integration.

## Support snapshots

The order snapshot preserves the business fields submitted, but replaces all
environment-owned identifiers with named placeholders. The never-persist-env
rule takes priority over a literal byte-for-byte payload containing those IDs.
Response metadata retains the remote identifier and send outcome without
credentials. No administrator endpoint exposes customer payloads.

## Changed areas

- Database: `lib/db/src/schema/shiphero.ts`, `orders.ts`, `shipments.ts`,
  `index.ts`; additive migration `lib/db/drizzle/0067_sleepy_doctor_strange.sql`
  and its snapshot/journal metadata.
- API services: `artifacts/api-server/src/lib/shiphero-config.ts`,
  `shiphero-client.ts`, `shiphero-outbound.ts`, `shiphero-webhooks.ts`.
- API routes: `artifacts/api-server/src/routes/shiphero-admin.ts`,
  `shiphero-webhook.ts`; registration/status hooks in `app.ts`, `index.ts`,
  `routes/admin.ts`, and `lib/invoices.ts`.
- Admin UI: `artifacts/musk-ellolo/src/components/admin/shiphero-integration-panel.tsx`
  and `pages/admin/integrations.tsx`.
- Contracts: `lib/api-spec/openapi.yaml` and regenerated React/Zod clients.
- Tests: outbound, webhook processor, raw receiver, order lifecycle, and admin
  configuration tests alongside those modules.

The additive migration was applied to the development database only. Production
was not changed and no application was published.