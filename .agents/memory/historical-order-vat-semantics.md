---
name: Historical order VAT semantics
description: Preserve the original financial meaning of old orders when applying VAT-inclusive pricing to new ones.
---

Old paid orders and new orders can have different interpretations of the same subtotal, shipping, discount, tax, and total fields. Determine which arithmetic a persisted order actually satisfies before issuing a late invoice or rendering its breakdown; do not relabel an old tax-added order as though its price already included tax. Reverse the posted journal lines rather than reconstructing a reversal from today's calculation rules.

**Why:** A blanket conversion to inclusive arithmetic makes old invoices disagree with the amount collected, while recreating reversal lines with the current formula can make cancellations fail or misstate accounts. Zero-rated international orders also need their actual destination considered when allocating product and shipping revenue, not just a balanced journal total.

**How to apply:** Any future change to order pricing, invoicing, PDF totals, or cancellation should test both historical and current arithmetic, including a paid old order invoiced later and a zero-VAT international sale.