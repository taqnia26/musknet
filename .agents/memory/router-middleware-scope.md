---
name: Router middleware scope
description: Prevent feature authentication from intercepting unrelated API routes in the shared router.
---

Mount feature-specific authentication middleware on the exact feature path rather than as a pathless middleware on a child router that is later composed into the shared API router.

**Why:** A pathless middleware in one composed feature router intercepted unrelated owner and admin authentication requests, returning the wrong authentication error even though the stored credentials were valid.

**How to apply:** When adding a feature router to the shared API router, scope its middleware to the same path prefix as its endpoints and verify one protected feature route plus unrelated public authentication routes.