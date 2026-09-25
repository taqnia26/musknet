# Order status inventory

## Storefront order status

The canonical `storefront_orders.status` lifecycle is exactly `cancelled`, `returned`, `pending_review`, `preparing`, `out_for_delivery`, `delivered`, `pending_payment`. It is separate from payment state (`pending`, `paid`, `failed`, `refunded`).

- `lib/db/src/schema/orders.ts` owns the canonical status constraint and `pending_review` default. `lib/api-spec/openapi.yaml` declares the same values for customer/admin orders, admin updates, and the order-list filter.
- Customer checkout in `artifacts/api-server/src/lib/storefront.ts` uses the DB default. Admin-created orders in `artifacts/api-server/src/routes/admin.ts` start at `pending_review`, or `pending_payment` when a payment link is requested.
- The admin orders list searches by customer name (alongside order number and tracking number) and displays `customerName`; see `artifacts/api-server/src/routes/admin.ts` and `artifacts/musk-ellolo/src/pages/admin/orders.tsx`. The dashboard's pending-order badge/count includes `pending_review` and `pending_payment` (`artifacts/api-server/src/routes/admin.ts`, displayed in `artifacts/musk-ellolo/src/pages/admin/dashboard.tsx`).
- Shipment tracking advances an order to `out_for_delivery` for `in_transit` and `delivered` for `delivered`; it does not replace shipment's own status. `pending_payment` orders are not advanced by carrier callbacks. Invoice/order cancellation writes remain in `artifacts/api-server/src/lib/invoices.ts`.
- Campaign reports and influencer metrics include paid orders except those with `status = cancelled` (`artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/src/routes/influencer.ts`). Other order statuses are not excluded by these filters.
- Customer history reads and labels the lifecycle at `artifacts/musk-ellolo/src/pages/account-orders.tsx` and `src/pages/account.tsx`.

The explicit SQL migration maps legacy persisted values without silently discarding state: `new` → `pending_review`; `processing` and `ready` → `preparing`; `shipped` → `out_for_delivery`; `completed` and `delivered` → `delivered`; `cancelled` remains `cancelled`. `returned`, `pending_review`, `preparing`, `out_for_delivery`, and `pending_payment` are already canonical and remain unchanged. Both the installer preflight and SQL migration reject any other value; reruns accept both the recognized legacy values and all canonical values. Counts are reported before and after migration. The development database was migrated; it had zero historical orders at preflight. The migration is part of the development database push command.

**Release gate:** Do not publish the new status constraint/code to an existing production database with historical orders until the production migration sequence is explicitly arranged. Replit's managed publish schema diff does not copy development data or run the development-only SQL data migration. Production values must be inventoried and mapped before applying the new constraint, with an atomic maintenance window or compatible staged release; never use a deploy/startup hook to run schema mutations. The Moyasar flow also remains disabled until a test secret and public HTTPS callback URL are configured and a real test invoice plus test email are confirmed.

## Shipment status (separate lifecycle)

Shipments have their own values (`pending`, `ready`, `in_transit`, `delivered`, `returned`, `cancelled`) in `lib/db/src/schema/shipments.ts`. Shipping/admin operations and carrier webhooks in `artifacts/api-server/src/routes/admin.ts` read/write shipment status and events. `artifacts/musk-ellolo/src/components/admin/shipping/shipping-dashboard-base.tsx` manages/displays that vocabulary. Only the explicit tracking mappings above propagate shipment milestones; shipment and storefront order statuses are not interchangeable.

## Purchase and contract status (separate domains)

- Purchase receipts use `draft`, `posted`, `voided`, while receipt payments use their own payment states (`lib/db/src/schema/operations-documents.ts`; writes in `artifacts/api-server/src/lib/operations.ts`). Inventory purchase orders use `draft`, `ordered`, `partially_received`, `received`, `cancelled` (`lib/db/src/schema/inventory-operations.ts`). Neither is a storefront order.
- Distributor contracts use `draft`, `seller_signed`, `sent`, `final`, `cancelled` (`lib/db/src/schema/distributor-contracts.ts`); transition checks are in `artifacts/api-server/src/lib/contracts.ts`, with admin/signature routes in `artifacts/api-server/src/routes/admin.ts`.

## Payment-link contracts

`AdminOrder` has an optional `paymentLink` object (`sent`, `status`, string `expiresAt`); `AdminOrderInput.sendPaymentLink` is optional. `POST /admin/orders/{id}/payment-link` returns `sent`, `status`, and string `expiresAt`. `POST /payments/moyasar/callback` accepts a string invoice `id` and returns boolean `accepted` and `duplicate`. The backing `storefront_order_payment_links` row is one-to-one with an order and stores nullable provider invoice/link/expiry fields, email delivery state/error, and timestamps.

To cancel an unpaid link order, the admin order-status update verifies the linked invoice with Moyasar. If it is active, the server calls Moyasar's `PUT /v1/invoices/:id/cancel` and requires the returned invoice to be canceled before performing the existing inventory/COGS cancellation reversal. An expired or previously canceled invoice can be canceled locally after its provider state is checked. Paid invoices cannot be canceled through this unpaid-order route; use the established payment/refund handling instead. Failed-email links are still provider invoices and follow the same safety check. A provider-canceled invoice cannot be reissued by retrying email delivery.