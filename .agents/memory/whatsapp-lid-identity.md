---
name: WhatsApp LID identity
description: Contact identification policy when WhatsApp supplies a privacy-preserving linked-device ID.
---

Treat a WhatsApp `@lid` identifier as an opaque conversation address, not a phone number. Show an unnamed-contact fallback until a trusted name arrives or service staff assign a manual label; never use the LID digits to join a shopper account.

**Why:** The digits in a LID are not the customer's telephone number. Presenting or matching them as such can misidentify a customer and disclose another person's account details.

**How to apply:** In later contact sync or customer-merging work, require an explicit verified mapping from WhatsApp or another trusted source before associating a LID conversation with a telephone number. Keep older LID conversations accessible even without that mapping.