---
name: Parallel Drizzle migrations
description: Concurrent tasks can make snapshot history disagree with SQL already registered in the journal.
---

When rebasing migrations from parallel work, do not trust the last snapshot alone as a faithful account of all SQL in the journal. Compare regenerated SQL against every recent registered migration before accepting it.

**Why:** A parallel task can commit a later snapshot derived from an older branch, so generating against it repeats columns already added by another registered migration. The SQL may compile but fail during deployment.

**How to apply:** Preserve the incoming journal order, generate at the next sequence, inspect SQL for duplicate operations against recent migrations, and ensure the final snapshot represents the merged schema.