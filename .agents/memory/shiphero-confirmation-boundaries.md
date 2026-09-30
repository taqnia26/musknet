---
name: ShipHero confirmation boundaries
description: External contract limits that must not be weakened when activating or changing the warehouse integration.
---

Duplicate-number rejection is not proof of a safely replayable Create Order.
An ambiguous create needs partner reconciliation, not an automatic retry.

**Why:** The partner confirmed unique order numbers and duplicate rejection, but
has not provided the Create Order example or a confirmed lookup/recovery contract.
A local uniqueness constraint cannot prove what happened after a remote timeout.

**How to apply:** Before activating or adding recovery actions, obtain a confirmed
identity/lookup contract. Never interpret an unclassified post-start failure or
a failed local save of a successful remote response as proof of non-creation.

Support snapshots must redact environment-owned identifiers even when a request
also asks for an exact payload snapshot.

**Why:** The same requirements explicitly prohibit persisting merchant/warehouse
identifiers and credentials. That prohibition takes priority over literal
byte-for-byte debugging copies; disclose the redaction rather than silently
weakening the rule.

**How to apply:** Keep business fields and remote result identifiers for support,
but do not add unredacted environment values to logs, tables, or admin responses.