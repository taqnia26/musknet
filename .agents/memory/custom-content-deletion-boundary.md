---
name: Custom content deletion boundary
description: Why arbitrary legacy site-content keys must not be assumed safe to delete.
---

Treat legacy and unknown site-content keys as protected rather than inferring deletion safety from the absence of current code references. The custom-content namespace is for inert, optional content only; do not introduce financial or operational dependencies on it.

**Why:** The original free-form key/value editor stored no provenance or dependency metadata. Existing arbitrary names cannot establish whether a key is disposable, and a finite denylist would silently expose future required settings.

**How to apply:** Keep new operational settings outside the disposable-content namespace. If future work needs deletion of legacy keys, require explicit classification after checking dependencies; never automatically reclassify or delete historical rows.