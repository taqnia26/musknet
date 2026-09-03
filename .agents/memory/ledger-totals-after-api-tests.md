---
name: Ledger totals after API tests
description: Why development trial-balance totals must be refreshed around accounting imports.
---

Do not assume a previously previewed development trial balance remains current after running the full API test suite. Capture the balance immediately before an accounting import and confirm it again with direct SQL afterward.

**Why:** Some integration tests create balanced development ledger activity without using the historical-import source type. The historical import remains untouched, but the global debit and credit totals can increase between preview and apply.

**How to apply:** Treat the imported source totals and the global trial balance as separate checks. Verify imported entry/line counts and imported debit-credit equality, then query the complete ledger directly for the final actual balance.