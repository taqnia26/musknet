---
name: Admin tour in browser tests
description: New administrator sessions can show the guided tour after an immediate visibility check.
---

For browser tests using a newly created administrator, wait for the guided tour to become visible and dismiss it before navigating to another admin page.

**Why:** A one-time `isVisible()` check immediately after login can run before the tour appears. Navigation then leaves the test looking at the dashboard under the tour overlay, so page buttons seem missing even though the feature works.

**How to apply:** In isolated admin browser fixtures with a new user, assert the skip control becomes visible, click it, assert it is hidden, and only then navigate to the target screen.