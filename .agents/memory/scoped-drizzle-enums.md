---
name: Scoped Drizzle provisioning
description: Why table filters alone are unsafe for provisioning an isolated feature in the shared database.
---

Do not use a narrowed `tablesFilter` as a safe substitute for a full-schema development push.

**Why:** Drizzle's table filter limits database introspection, not every declared schema object or enum diff. With the full schema it proposed creating existing business tables; with a narrowed schema it proposed dropping unrelated live enum types. PostgreSQL rejected those operations, but the approach is not safe for isolated provisioning.

**How to apply:** Keep the full database model for normal schema reconciliation. For a narrowly scoped feature, inspect and apply additive development SQL only to the intended tables, then verify the live definitions. Managed production schema changes still belong to Publish.