---
name: Business backup recovery boundaries
description: Non-obvious safety requirements for restoring business data without replaying external effects or reusing issued numbers.
---

A historical business-data restore must not restore old external dispatch queues or erase current delivery and webhook deduplication facts.

**Why:** Carrier fulfillment, payment events, and sent invoices do not roll back with PostgreSQL. Deleting their current bookkeeping permits duplicate external effects. Current provider rows may reference business rows absent from the chosen snapshot, so retaining them requires an FK-free audit representation rather than dropping their facts.

**How to apply:** Preserve current external facts, quarantine unfinished dispatches, and retain invoice-number high-water marks independently from restored business tables. A lost COMMIT response is an uncertain outcome, not proof of rollback: keep maintenance enabled for operator recovery.

Parked external facts must participate in later restores, not merely remain as audit history.

**Why:** Restoring before an order existed parks its sent-dispatch fact; restoring a later snapshot can bring the order back without that dispatch. Without rehydration and terminal-state precedence, the app can send the same external order again. Exact-content deduplication alone is insufficient when quarantine changes row contents but not their identity.

**How to apply:** Verify successive restores with mixed provider facts intact, including PostgreSQL JSONB serialization. Prefer terminal/uncertain facts over pending work and preserve database uniqueness without suppressing non-conflict business-data failures.

API admission fences alone cannot stop previously signed cloud uploads.

**Why:** Those uploads go directly to the storage provider and remain valid after the app blocks new requests.

**How to apply:** Drain admitted writers, account for the outstanding upload validity window, and use conditional generation/integrity checks. Never infer database/files consistency solely from an HTTP maintenance flag.

Archive version tokens must survive intact copies to another disk or host. Physical inode/device/change timestamps belong in active-read race detection, not in the version tokens recorded inside archive manifests.

**Why:** A filesystem copy preserves archive contents but changes physical file identity. Binding manifest versions to that identity makes otherwise valid off-host backups impossible to restore.

**How to apply:** Keep logical versions content/metadata-aware and persistent, independently verify payload digests and filesystem read stability, and verify inspection plus restoration from a copied archive directory with a fresh storage instance.