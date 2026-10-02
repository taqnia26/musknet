---
name: Invoice cancellation intent
description: Product intent behind the simplified company invoice cancellation confirmation.
---

Company invoice cancellation is a confirmation of the existing accounting action, not deletion. Do not restore a mandatory business-reason field merely because the API requires a cancellation description; the description should truthfully record the administrator's confirmation without inventing a commercial reason.

**Why:** The user requested «هل تريد إلغاء الفاتورة؟» with «تراجع» and «تأكيد» only, while preserving cancellation rules and the actor/time audit.

**How to apply:** Keep subsequent revisions to this confirmation distinct from invoice deletion, archival, or accounting policy changes. Language changes to the prompt must not change the meaning of the recorded consent.