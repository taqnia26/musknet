---
name: Accounting cleanup database identity
description: Guardrails for manually cleaning historical journals when the operator's database differs from the agent-accessible production replica.
---

Treat journal source IDs as portable import identity, but never treat database-generated journal, line, audit, or entry-number values from one database as a recovery backup for another. Confirm which database the operator will actually modify and obtain a complete, matching backup and restore procedure from that exact target before supplying an executable deletion script.

**Why:** A manual cleanup reportedly encountered journal IDs differing from the agent-accessible production replica, even though the import's source identifier set matched. The existing recovery file embeds local IDs from the replica and could conflict with unrelated records on the reported target. Matching source identifiers alone does not prove every journal and dependent field is identical.

**How to apply:** For destructive accounting operations, compare read-only counts, source-ID digest, dependent row totals, and ID ranges from the operator's SQL client with the backup. If environments disagree, stop and request a target-specific export rather than relaxing a safety guard or reusing the other database's restore SQL.