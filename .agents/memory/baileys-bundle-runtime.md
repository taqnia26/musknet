---
name: Baileys bundle runtime
description: Runtime dependency behavior when bundling Baileys into the API server with esbuild in the pnpm workspace.
---

When Baileys is bundled with esbuild, a successful build does not prove the generated server can start. Baileys may retain a runtime import of `protobufjs`, so that package must be directly resolvable from the server's runtime/build environment.

**Why:** The API bundle completed successfully but failed at startup with `ERR_MODULE_NOT_FOUND` for `protobufjs`.

**How to apply:** After any Baileys dependency or bundler change, restart the actual API workflow rather than relying only on typecheck/build. Keep `protobufjs` as an explicit runtime dependency wherever the workspace build resolves server packages.