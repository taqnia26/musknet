---
name: OpenAPI UUID validation
description: UUID path parameters and the current OpenAPI-to-Zod generator.
---

Describe new UUID path parameters with a string `pattern` rather than `format: uuid` until the OpenAPI generator and installed Zod version agree.

**Why:** The current generator emits `zod.uuid()` for UUID formats, but the installed Zod version does not expose that top-level API; library typechecking fails after generation.

**How to apply:** Put the UUID regular expression in the OpenAPI schema, keep server-side validation for the actual path, and rerun code generation. Revisit after coordinated generator/Zod upgrades.