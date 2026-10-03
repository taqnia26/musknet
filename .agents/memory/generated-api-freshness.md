---
name: Generated API freshness
description: Why stale generated API output can block unrelated frontend work.
---

When frontend type errors span unrelated features or Vite reports duplicate exports inside generated API code, first check whether generated clients are stale relative to the OpenAPI spec and regenerate them using the project's codegen workflow.

**Why:** A stale generated client blocked the whole frontend preview with duplicate exports, while its emitted declarations lacked several current API methods. Neither problem came from the UI change being verified.

**How to apply:** Treat generated code as build output, not a place for manual fixes. Check both generated source and emitted declarations: they can be stale independently. Run the complete project codegen workflow, including postprocessing and workspace-library rebuilding, rather than changing a valid UI caller to match old declarations. A standalone forced TypeScript rebuild does not repair raw generator initialization errors. After regeneration, rerun the frontend typecheck and check the preview before attributing the failure to an unrelated edit.