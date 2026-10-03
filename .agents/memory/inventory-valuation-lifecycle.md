---
name: Inventory valuation lifecycle
description: Transaction and valuation rules for linked inventory, sales, manufacturing, and accounting operations.
---

Lock every affected inventory item in deterministic order before reading quantities or weighted-average costs, and update global stock, per-location balances, movements, operation events, and journals in one transaction. Every stock writer must preserve the global total against available, reserved, and in-transit location quantities.

Capture unit cost immutably when inventory leaves stock. Post COGS from that snapshot at fulfillment, not from a later average cost. On cancellation or return, reverse only journals that actually exist and revalue returned stock using the same snapshot.

**Why:** Recomputing cost later or writing from stale quantities can make inventory valuation diverge from the general ledger under ordinary purchases, payments, cancellations, and concurrent requests.

**How to apply:** Use these rules for every new purchase receipt, production consumption/output, fulfillment, cancellation, refund, opening balance, or inventory adjustment path.

Order-edit cost provenance is cumulative: downstream returns/cancellations must consider original fulfillment plus audited edits, not require all quantities to have the original unit cost or original journal alone.

**Why:** Added units can carry a later cost, and an originally zero-cost order can acquire its first positive cost through editing. Original-only checks incorrectly reject legitimate returns or subsequent edits.

**How to apply:** Reconcile audited movements and their posted journals against the current line snapshot, including increases, decreases and blended costs; do not substitute today's inventory cost for missing historical evidence.