---
name: Polymorphic journal source identity
description: How to identify journal entries created by different business record types.
---

Treat a journal entry source as the pair of source type and source ID; a source ID alone is not globally unique across business tables.

**Why:** Independent tables commonly reuse the same numeric IDs, so selecting by source ID alone can return a valid journal entry for the wrong business record and make isolated tests nondeterministic.

**How to apply:** Any lookup, assertion, idempotency check, or reconciliation keyed to a journal source must constrain both parts of the source identity.