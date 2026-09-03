---
name: Lazy video request tests
description: Reliable assertions for deferred HTML video loading in browser tests.
---

Treat `HTMLMediaElement.currentSrc` as source selection, not proof that the browser fetched video data. For lazy videos using `preload="none"`, verify the network request log and `readyState` instead.

**Why:** Chromium may populate `currentSrc` from nested `<source>` elements while `readyState` remains `HAVE_NOTHING` and no media request has been sent.

**How to apply:** In video-loading regression tests, fail on observed media requests before the viewport threshold, assert `readyState === 0`, and separately verify the expected source elements remain in the DOM.