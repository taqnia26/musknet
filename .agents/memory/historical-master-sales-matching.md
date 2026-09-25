---
name: Historical Master Sales matching
description: Why historical company invoice entry uses a conservative month-wide conflict for prior imported journals.
---

Treat any Master Sales import journal in the original invoice's issue month or in a collection's payment month as a possible duplicate, not only a journal naming the same company.

**Why:** The import can use a retailer alias rather than the company's legal name, and it already recorded cash, revenue and tax. A narrower name match could post the same sale and collection twice.

**How to apply:** Require a documented finance review of the original invoice, import row, and receipts before posting overlapping history; do not silently delete or reverse the imported journal. This is a guard, not proof that all other external sources have been reconciled.