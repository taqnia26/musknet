---
name: Custom content deletion boundary
description: Why arbitrary legacy site-content keys must not be assumed safe to delete.
---

Treat legacy and unknown site-content keys as protected rather than inferring deletion safety from the absence of current code references. The custom-content namespace is for inert, optional content only; do not introduce financial or operational dependencies on it.

**Why:** The original free-form key/value editor stored no provenance or dependency metadata. Existing arbitrary names cannot establish whether a key is disposable, and a finite denylist would silently expose future required settings.

**How to apply:** Keep new operational settings outside the disposable-content namespace. If future work needs deletion of legacy keys, require explicit classification after checking dependencies; never automatically reclassify or delete historical rows.

Deletion recovery must fail closed when content is unsafe to retain; do not delete it without a recovery copy or silently redact the archived value. Restoration requires both edit and delete authority and must never replace a currently existing key.

**Why:** A recovery archive is another durable copy, so retaining credentials or financial settings would expand their exposure. Silently dropping fields would also make a promised restoration incomplete. Combining edit and delete authority prevents introducing a weaker path for recreating deleted content.

**How to apply:** Validate eligibility on both deletion and restoration, including serialized structured values. Keep operational and financial configuration outside custom content, and return an explicit conflict rather than overwriting a recreated key.