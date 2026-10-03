---
name: Composite foreign-key bootstrap
description: Fresh PostgreSQL provisioning can fail when referenced unique indexes are emitted after foreign keys.
---

Do not treat a successful Drizzle push exit code as proof that a fresh test schema is complete. Ensure referenced composite unique indexes exist before creating their foreign keys, and fail immediately on SQL errors.

**Why:** A fresh isolated cluster logged a missing referenced unique index during push but the command continued successfully, leaving later indexes absent. Accounting then failed for an unrelated-looking ON CONFLICT operation.

**How to apply:** For empty disposable clusters, dependency-order exported DDL and run it with strict SQL error handling, then install the custom integrity objects. Never apply empty-state exported DDL to an existing development or production database; those require separately approved migrations.

Migration verification must also exercise the actual upgrade path, not only the
test harness's reordered export. Inline UNIQUE constraints fix fresh exports but
Drizzle may still add dependent foreign keys before those constraints on upgrades.
Establish referenced keys as an explicit prerequisite; adopt existing valid unique
indexes without dropping dependent foreign keys.

**Why:** The user reported identical missing-key failures across two deploys despite
feature changes. Reordering DDL in test setup concealed the deploy-path failure.

**How to apply:** Gate further sales-returns feature work on real PostgreSQL migration
success. Test an empty schema, an existing schema missing the keys, and one with the
old indexes. Inspect catalog definitions and SQL errors, not just process exit codes.
Do not claim private-server constraints were verified from the workspace database.