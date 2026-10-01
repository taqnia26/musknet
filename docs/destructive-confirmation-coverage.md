# Destructive confirmation coverage

This frontend implementation fills confirmation gaps without changing backend operations. Confirmations retain the existing mutation payloads, callbacks, refresh behavior, permissions, and server semantics.

## Added in this pass

- `admin/orders.tsx`: confirm cancellation, marking a return, and marking payment refunded from either table/detail controls. Selecting an option does not change the controlled value until the server accepts the confirmed mutation.
- `admin/shipping/shipping-dashboard-base.tsx`: confirm registering/updating cancelled or returned shipment status with the order/invoice/shipment reference and explicit separation from carrier actions and refunds. Cancelling the confirmation leaves the shipment form as an unsaved draft.
- `admin/gifting-issues.tsx`: confirm validated quantity returns with the product and new/main vs opened-tester stock effect; preserve retry idempotency keys. The existing movement-delete prompt remains in place with a synchronous in-flight guard.
- `account-addresses.tsx`: confirm saved address deletion, naming the address.
- `admin/purchases.tsx`: confirm archiving the named purchase without claiming deletion or journal reversal.
- `admin/shiphero-integration-panel.tsx`: confirm deleting the local product mapping, identifying the product and SKU. Remote product deletion and immutable mapping statuses remain unsupported.
- `admin/influencers.tsx`: confirm influencer deactivation and unlinking a coupon from an influencer; existing historical order data is retained.
- `admin/products.tsx`: confirm hiding a sellable product from the storefront; showing it again remains direct.
- `admin/distributor-catalog/index.tsx`: confirm hiding a product from the distributor catalog through both the quick toggle and edit-form Save; the full edited payload is preserved, cancellation leaves the draft intact, and showing it again remains direct.
- `admin/inventory/balances.tsx`: confirm an edit that deactivates an active inventory item or removes its sellable status.
- `admin/inventory/locations.tsx`: confirm deactivating an active inventory location.
- `admin/staff.tsx`: confirm deactivation through the user-edit form. The separate existing disable action remains confirmed.
- `admin/hr.tsx`: confirm deactivation through the employee-edit form and rejection of a pending leave request.

These paths use the shared destructive-confirmation hook and disable their initiating controls while confirmation or mutation is pending.

The edit-control audit found no additional persisted status bypasses in the product, distributor, or coupon edit forms: those forms expose no active/sellable visibility control. Product storefront visibility is handled by its separately confirmed action; distributor and coupon deactivation remain on their existing confirmed disable actions. Staff, inventory-location, inventory-item, and distributor-catalog edit controls do expose their status fields and are guarded above.

## Existing confirmation paths retained

- Products: explicit disable remains guarded by its existing `window.confirm`; categories retain their disable prompt and permanent-delete alert dialog; coupons retain their disable prompt and campaign-impact conflict flow.
- Inventory: cycle-count and location deletions retain their prompts; inventory-item deletion retains its existing alert dialog.
- Business operations: campaign pause, exhibition/manufacturing/finance deletions, production-plan cancellation, contract deletion/file deletion/cancellation, and invoice archive/cancellation retain their existing confirmations.
- Accounting reversals retain their existing confirmation dialog; integration setup removal retains its alert dialog.
- Staff/distributor disable actions and social-marketing deletion/manual-publication actions retain their existing prompts.
- Owner-portal session revocation retains its existing prompts. `b2b-agenda.tsx` already has `window.confirm`; it is intentionally unchanged and has no added prompt.

## Not persisted / excluded from destructive confirmation

- Site-content row removal only changes `localItems`; Save sends the remaining items to an upsert endpoint. The server loops over submitted keys and inserts/updates them; omitted keys are not deleted. Therefore no persisted-delete confirmation or fake delete path was added. A real delete operation is a deferred product/API capability.
- Shopping-cart quantity edits and removing an item from the shopper's editable cart are normal cart editing, not administrative record deletion.
- Unsaved form-row/file-selection removal and other local-only editing were not treated as persisted business-record deletion.

## Unsupported operations retained

- Site-content keys have no persisted delete endpoint/semantics, so removal remains local-only.
- No new order/invoice permanent-delete action, refund workflow, accounting reversal permission, or inventory bypass was introduced.

## Verification

- Shared libraries and final frontend TypeScript checks passed. The production Vite build passed with the managed service's port and root base path supplied.
- Static review covered the added handlers, mutation snapshots, callbacks, idempotency, and duplicate/cancellation guards. It caught and closed the distributor-catalog edit-form bypass.
- One mock-only browser pass verified order cancellation: cancel/Escape sent zero PATCH requests; two synchronous confirmation clicks during a delayed response sent exactly one PATCH. A mocked 403 remained visible with an explicit retry, and the dialog closed after success.
- The same browser pass checked English and Arabic RTL, safe initial focus on Cancel, and a 390px mobile confirmation layout.
- Other changed handlers were statically reviewed, not exercised in that browser pass. No real business mutation, database fixture, financial refund, or inventory change was performed. A persisted multi-flow regression suite is separate follow-up work.