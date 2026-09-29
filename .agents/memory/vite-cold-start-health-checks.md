---
name: Vite cold-start health checks
description: Distinguish transient slow first requests from artifact workflow port failures
---

After a large generated-client or dependency change, a Vite development server can print its ready line while still processing its first requests long enough for the artifact workflow's health check to time out.

**Why:** A working server on the configured port initially took much longer than its health-check window to return HTTP 200, while no port or routing configuration was wrong. Once the initial processing completed, the managed workflow started normally.

**How to apply:** Check the actual listener and measure both local-port and routed HTTP responses before changing artifact workflow or port settings. If requests eventually succeed, allow initial processing to complete and retry the managed service; do not create a duplicate workflow.