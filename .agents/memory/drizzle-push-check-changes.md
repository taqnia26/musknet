---
name: Drizzle push check-constraint changes
description: Schema push can miss edits to an existing PostgreSQL CHECK constraint.
---

After changing an existing PostgreSQL CHECK constraint, compare the live `pg_get_constraintdef` result with the generated migration. Do not infer that `drizzle-kit push` applied the revised condition just because it reports success.

**Why:** A development push added columns but left an earlier status CHECK unchanged, so a valid new status failed at runtime. The generated SQL migration did contain the required DROP/ADD constraint statements.

**How to apply:** On an existing development database, verify the live constraint and apply its migration explicitly if necessary. Never run the corrective DDL on production outside an approved deployment/migration process.