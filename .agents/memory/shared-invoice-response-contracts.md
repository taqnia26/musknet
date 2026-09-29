---
name: Shared invoice response contracts
description: Required display fields may propagate into invoice creation responses through shared OpenAPI schemas.
---

When adding a required invoice display field to a shared response schema, check every create and replay endpoint that inherits it, not just the list endpoint. Add a request-level test for both first issuance and replay.

**Why:** A creation transaction may commit successfully before response validation throws, returning a misleading server error for a real invoice.

**How to apply:** Check generated response validators and route payloads whenever changing shared invoice schemas, especially calculated or joined display fields not stored on the invoice row.