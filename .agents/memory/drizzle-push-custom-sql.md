---
name: Drizzle push and custom SQL
description: How to deploy PostgreSQL functions and triggers when the project provisions databases with Drizzle schema push.
---

When the supported database workflow uses `drizzle-kit push`, custom SQL embedded only in generated migration files is not deployed. Any required functions, constraint triggers, or other handwritten database objects need an idempotent installer chained into the same push/provisioning command, plus a verification command that fails when objects are missing.

**Why:** Drizzle push derives DDL from the TypeScript schema and does not execute handwritten migration SQL, which can leave critical database invariants absent on a fresh environment.

**How to apply:** Whenever a feature relies on custom PostgreSQL objects that Drizzle cannot express, make their installation transactional and repeatable, invoke it from every supported push path, and verify the expected objects after installation.