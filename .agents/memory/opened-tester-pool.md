---
name: Opened tester pool
description: Preserve the separate B2B opened-tester balance and its accounting identity across returns, reissues, and publishing.
---

Treat an opened B2B tester as a reusable, separately available inventory asset, not as sellable main stock. Keep the existing opened-return pool rather than introducing another location for the same physical testers. New returns may re-enter main stock; opened returns must remain separate. Reissues can be returnable evaluations or final tester expenses, and the source must be chosen explicitly.

**Why:** Historic opened returns already have balances in that pool. A second pool would split available testers and create mismatches between stock and journal values. Replit-managed publishing applies schema differences but does not guarantee that custom SQL data-renames run, so a new display name must not depend solely on a database UPDATE.

**How to apply:** When extending inventory and reports, exclude opened testers from sellable availability and reorder suggestions, but include their carrying value when reconciling inventory assets against the ledger. Resolve the existing pool's name at display boundaries. Never let ordinary transfers or stock adjustments consume this pool.

For partial returns, persist idempotency per return event rather than on the parent issue.

**Why:** A mutable key on the parent gets overwritten by the next partial return, allowing an old retry to add stock and reverse expense a second time.

**How to apply:** Give every return its own uniquely keyed event and replay the stored response for matching retries; reject reuse of that key with a different issue, quantity, or condition.