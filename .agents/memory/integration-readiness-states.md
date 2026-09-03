---
name: Integration readiness states
description: How external-provider setup and live connection status must be represented.
---

Provider setup must use separate states for configuration saved versus a live API connection verified. Never label a provider as connected merely because non-secret account metadata exists.

**Why:** A static or saved setup badge can otherwise mislead administrators into believing payments, shipping, invoicing, or ERP synchronization is operating when no provider adapter or credential validation has run.

**How to apply:** Store only non-secret account labels and API endpoints in application tables. Keep credentials in project secrets, and promote a provider to connected only after its real API adapter validates successfully.