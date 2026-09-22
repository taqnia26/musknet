---
name: Transactional email credentials
description: Durable credential boundary for transactional email when connector availability varies by environment.
---

Use the Replit connector when it is attached, but retain a server-side provider API-key fallback through Replit Secrets when connector availability differs by environment. Never store provider credentials in application tables or expose them through API responses.

**Why:** Transactional email must remain deployable when a connector is unavailable, while preserving the same credential boundary and preventing provider secrets from entering application data.

**How to apply:** For transactional email, use an attached connector or request the provider key and sender identity through the secrets flow, validate access with a harmless provider read, and keep all credential access server-side.