---
name: Object storage abort signals
description: How to interpret browser request-failure events that accompany successful signed object-storage operations.
---

A browser or automation layer can emit `net::ERR_ABORTED` for a signed object-storage PUT or an API DELETE even when the server response is successful and the requested operation completed.

**Why:** Contract upload testing observed successful storage `200` responses with the full stored byte count and successful metadata creation, while the browser automation simultaneously emitted a request-failure event. The same pattern followed a successful `204` delete.

**How to apply:** Determine success from the HTTP response and resulting persisted state, not a request-failure event alone. For safe signed PUTs, retry once only when `fetch` itself rejects; never retry solely because external instrumentation reports an abort.