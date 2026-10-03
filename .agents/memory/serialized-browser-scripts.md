---
name: Serialized browser scripts
description: Compiler-dependent behavior when embedding a trusted document script through function serialization
---
Serializing a TypeScript function with `toString()` can retain esbuild's naming helpers, even though its TypeScript annotations disappear. Those helpers may exist in the module runtime but not in the isolated document runtime.

**Why:** Document pagination ran in the server bundle but initially timed out under the source-based runner because an injected naming helper was undefined in the embedded browser script.

**How to apply:** Any embedded trusted script must be self-contained. Check actual isolated document execution for source-based tests, Vite development/optimized output and the API bundle, rather than assuming a passing TypeScript build proves browser execution.