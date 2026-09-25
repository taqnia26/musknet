---
name: Monthly obligation occurrences
description: Why recurring owner obligations use explicit monthly occurrences instead of silently creating debts or payments.
---

Monthly owner obligations are separate, explicitly initiated occurrences. Renewal carries the amount, responsible party, and original due-day anchor into the next month, but does not carry payment, transfer approval, or any accounting entry.

**Why:** A label saying “monthly” is not evidence that another liability was incurred or paid. Separate occurrences prevent a payment in one month from settling another and keep each period’s review auditable.

**How to apply:** If adding scheduled renewals later, distinguish an upcoming reminder from a confirmed obligation occurrence. Never turn a calendar rollover into a payment or posted journal.