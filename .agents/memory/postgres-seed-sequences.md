---
name: PostgreSQL seed sequences
description: A database-specific constraint when seed data uses explicit numeric IDs.
---

When seed data inserts explicit IDs into serial-backed tables, synchronize each PostgreSQL sequence to at least the current maximum ID before relying on automatic IDs.

**Why:** An admin-route test exposed a primary-key collision because existing seeded category IDs were ahead of the table sequence, so a normal insert attempted to reuse ID 1.

**How to apply:** When changing seed logic or adding creation flows for serial-backed store tables, confirm the sequence follows the seeded maximum; keep isolated tests independent of the ambient sequence until the database repair is applied.