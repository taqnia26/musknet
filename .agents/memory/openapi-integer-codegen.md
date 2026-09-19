---
name: OpenAPI integer codegen
description: Contract workaround for integer fields with the current Orval and Zod versions.
---

Define integer-valued response fields as `type: number` with `multipleOf: 1` in OpenAPI.

**Why:** The current generator emits `zod.int()` for `type: integer`, but the installed Zod version does not export that API, so library typechecking fails immediately after code generation.

**How to apply:** Use this representation for new integer response properties and rerun API code generation. Revisit the workaround only after the generator and Zod versions are upgraded together.