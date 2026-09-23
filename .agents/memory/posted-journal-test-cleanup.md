---
name: Posted journal test cleanup
description: Safe transaction ordering when removing posted accounting fixtures from development tests.
---

When cleaning a posted journal fixture, disable the immutability triggers before the deletion transaction, then re-enable them after it commits, using `finally` so a failed deletion does not leave protection disabled.

**Why:** PostgreSQL rejects re-enabling a journal trigger inside the same transaction after deleting dependent rows because pending trigger events remain. A failed test cleanup can leave fixture invoices and financial entries that contaminate later financial-report assertions.

**How to apply:** Scope deletions to known fixture IDs, remove audit and lines before entries, commit, and restore triggers even on failure. Never use this procedure for ordinary business operations or real accounting records.