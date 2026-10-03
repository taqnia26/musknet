---
name: Meeting outcome scope boundaries
description: Confirmed boundaries for product fields, phone invoices, returns, deferred payments, cart links, and Saudi address intake.
---

Remove target quantity, reorder threshold, and opening quantity only from the product add/edit screen. Preserve stored inventory and thresholds, and keep compare-at price. This item must not change invoice screens or templates.

**Why:** The user explicitly narrowed the original meeting instruction to the product screen and confirmed that compare-at price is a separate price control.

**How to apply:** Do not submit hidden inventory defaults on product edits. Treat independently requested invoice layout changes as separate work.

Phone orders are a new real-order workflow, visible to the warehouse, using the existing review → preparation → delivery → delivered statuses. Automatically issue exactly one linked individual invoice only on delivery, never on creation or early collection. Preserve the existing standalone direct-invoice workflow and other order-source issuance rules.

**Why:** The user explicitly confirmed a new phone-order workflow, not a reuse or conversion of standalone individual invoices.

**How to apply:** Delivery and invoice creation must commit atomically with replay protection. Do not resume external shipping integrations while awaiting the partner's reply. Show exact schema SQL and obtain approval before applying it.

Historical order sources must remain unclassified rather than being inferred from payment methods or addresses.

**Why:** The approved phone-source migration preserves historical provenance and must not accidentally change existing invoice timing.

**How to apply:** Treat an unknown source with the existing non-phone invoice policy. Assign a known source explicitly only for new orders.

Approval of operational sales returns does not authorize expanding financial cancellation, credit-note issuance, or cash refunds. Preserve original issued sales documents while awaiting the separate financial-policy decision.

**Why:** The meeting review separated the inventory-return item from the cancellation/archive policy, whose expansion remains subject to the owner's approval.

**How to apply:** Treat later financial corrections as an explicitly approved scope. Never interpret approval of return storage or stock recovery as permission to refund money or cancel the entire original sale.

Keep order numbering as L-123 for individual and phone orders, and CO-00000123 for company orders. Do not introduce a separate phone prefix or renumber previous records.

**Why:** The owner explicitly chose to preserve these existing formats rather than distinguish phone orders with a new prefix.

**How to apply:** Preserve this numbering policy when extending order creation; phone-order identification remains separate from its number.

Delivery to the customer versus pickup from the business site must be a separate order choice from regular versus refrigerated shipping. Keep both distinctions; do not replace shipping type with fulfillment method.

**Why:** The owner explicitly approved adding the independent delivery/pickup choice while retaining regular/refrigerated shipping.

**How to apply:** Keep fulfillment metadata distinct from shipping-service data. Preserve unknown historical fulfillment; do not infer it from old shipping-method strings.

The delivery/pickup choice is only in the control panel, not customer checkout. Pickup costs a final 25 SAR per order.

**Why:** The owner said «في لوحة التحكم بس مابغاها تظهر للعميل» and entered 25 as the final per-order pickup fee.

**How to apply:** Keep the picker admin-only for admin/phone creation and the fee server-owned. Do not enable customer pickup or change this fee without a new instruction.

Do not add fulfillment changes to the generic saved-order status edit.

**Why:** Switching delivery/pickup also changes charges and can conflict with an issued invoice; the approved addition is a creation choice, not a silent financial recalculation.

**How to apply:** A future fulfillment-edit request needs an explicit workflow that protects recorded charges, issued documents, and advanced shipments.

The approved new-payment list is «ابل باي وتابي وتمارا وتحويل بنكي والدفع عند الاستلام».

**Why:** The user's explicit comment listed all five, overriding the same form's narrower bank-transfer-and-Apple-Pay selection.

**How to apply:** Preserve historical payment identifiers and records. The list is a product requirement, not proof of provider activation or authorization to create live payments.

Payment provider accounts are not activated. The user's scope is «جهز الخانات بس لحد مانربط مع ميسر».

**Why:** The user explicitly deferred provider connection and requested fields only.

**How to apply:** Do not request credentials or enable live payment as part of preparing these fields. Adding credentials alone must not activate checkout; provider setup and verification require a separate approved step.

The customer link destination is «سلة العميل داخل المتجر», not the existing administrative order's hosted Moyasar payment page.

**Why:** The user explicitly chose the cart option after being told it is not payment of an existing administrative order.

**How to apply:** Open the authenticated customer's current cart. Do not copy an existing administrative or phone order into it, create a duplicate order, or treat opening the link as approval to activate payments.

Inside Saudi Arabia, request only the national address short code on administrative/phone orders and individual/distributor profile intake. Preserve existing hidden address details and international requirements; this does not extend to customer checkout or change the external carrier contract.

**Why:** The user wrote «بالسعودية فقط العنوان الوطني المخصر» and «كلهم» for the three listed administrative screens, overriding the narrower screen selection.

**How to apply:** Do not invent a city or clear stored geography just because its controls are hidden. Without a recorded city, require explicit delivery charges rather than silently choosing the Riyadh/other-city tariff. Preserve the fixed pickup fee and charges on existing orders.