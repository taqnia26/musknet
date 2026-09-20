---
name: API auth test isolation
description: Why admin API integration test files must not run concurrently in the shared test process.
---

Run admin API integration test files sequentially when they set administrator credentials or bootstrap sessions through shared process environment variables.

**Why:** Concurrent files can overwrite or remove the same authentication environment variables while another suite is still running, producing intermittent 401 responses even though each file passes independently.

**How to apply:** Use separate Vitest invocations for auth-heavy route suites, or redesign their fixtures to avoid shared mutable process environment state before enabling parallel execution.