---
name: Composite foreign-key bootstrap
description: Fresh PostgreSQL provisioning can fail when referenced unique indexes are emitted after foreign keys.
---

Do not treat a successful Drizzle push exit code as proof that a fresh test schema is complete. Ensure referenced composite unique indexes exist before creating their foreign keys, and fail immediately on SQL errors.

**Why:** A fresh isolated cluster logged a missing referenced unique index during push but the command continued successfully, leaving later indexes absent. Accounting then failed for an unrelated-looking ON CONFLICT operation.

**How to apply:** For empty disposable clusters, dependency-order exported DDL and run it with strict SQL error handling, then install the custom integrity objects. Never apply empty-state exported DDL to an existing development or production database; those require separately approved migrations.