---
name: Generated Zod initialization
description: Source-based validation can fail when generated Zod schemas use constants declared later.
---

Treat a source-based Zod `ReferenceError` from a generated schema referencing its own later-declared regex or limit constant as a generator ordering issue, not an API handler failure.

**Why:** The generated module can refer to block-scoped validation constants before initialization. A server bundle may start while source-based tests and library typechecking still fail.

**How to apply:** Fix the generator or its schema configuration rather than hand-editing generated output; confirm both source-based tests and the bundled runtime afterwards.