---
name: Generated Zod initialization
description: Source-based validation can fail when generated Zod schemas use constants declared later.
---

Treat a source-based Zod `ReferenceError` from a generated schema referencing its own later-declared regex or limit constant as a generator ordering issue, not an API handler failure.

**Why:** The generated module can refer to block-scoped validation constants before initialization. Bundling and Vitest transforms can hide the error by hoisting declarations; passing those checks does not prove a native source import is safe.

**How to apply:** Fix the generator or its schema configuration rather than hand-editing generated output; if its output ordering cannot be configured, add a repeatable dependency-order repair to codegen, not a list of known constant names. Confirm a native source-import smoke test, a clean library build, and the bundled runtime afterwards.