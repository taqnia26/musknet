---
name: Meeting outcome scope boundaries
description: Confirmed distinction between product-field removal, new phone orders, and existing direct invoices.
---

Remove target quantity, reorder threshold, and opening quantity only from the product add/edit screen. Preserve stored inventory and thresholds, and keep compare-at price. This item must not change invoice screens or templates.

**Why:** The user explicitly narrowed the original meeting instruction to the product screen and confirmed that compare-at price is a separate price control.

**How to apply:** Do not submit hidden inventory defaults on product edits. Treat independently requested invoice layout changes as separate work.

Phone orders are a new real-order workflow, visible to the warehouse, using the existing review → preparation → delivery → delivered statuses. Automatically issue exactly one linked individual invoice only on delivery, never on creation or early collection. Preserve the existing standalone direct-invoice workflow and other order-source issuance rules.

**Why:** The user explicitly confirmed a new phone-order workflow, not a reuse or conversion of standalone individual invoices.

**How to apply:** Delivery and invoice creation must commit atomically with replay protection. Do not resume external shipping integrations while awaiting the partner's reply. Show exact schema SQL and obtain approval before applying it.