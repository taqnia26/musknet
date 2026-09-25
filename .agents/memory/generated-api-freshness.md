---
name: Generated API freshness
description: Why stale generated API output can block unrelated frontend work.
---

When frontend type errors span unrelated features or Vite reports duplicate exports inside generated API code, first check whether generated clients are stale relative to the OpenAPI spec and regenerate them using the project's codegen workflow.

**Why:** A stale generated client blocked the whole frontend preview with duplicate exports, while its emitted declarations lacked several current API methods. Neither problem came from the UI change being verified.

**How to apply:** Treat generated code as build output, not a place for manual fixes. After regeneration, rerun the frontend typecheck and check the preview before attributing the failure to an unrelated edit.