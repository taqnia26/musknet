---
name: External protocol browser tests
description: How to test mailto and similar external-protocol actions reliably in browser E2E tests.
---

Expose the fully computed external-protocol URL on the initiating element and assert that value in browser tests instead of waiting for the page URL to change.

**Why:** Headless Chromium may hand `mailto:` and similar protocols to an unavailable external application without changing `window.location`, so navigation-based assertions can time out even when the UI generated the correct action.

**How to apply:** For email drafts and other external handlers, validate the destination and encoded content from an in-page attribute or pure URL builder, then separately assert the UI accepts the action.