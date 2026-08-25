---
name: Drizzle migration output
description: Drizzle Kit migration generation path behavior in the database workspace package.
---

Keep the Drizzle migration `out` setting relative to the database package working directory.

**Why:** An absolute path built from the config directory was accepted for the first migration but later generation prefixed the package directory again and could not read its own snapshot metadata.

**How to apply:** Run migration generation from `lib/db` and use `out: "./drizzle"` so subsequent migrations can consistently find the journal and snapshots.