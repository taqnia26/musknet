---
name: Invoice suite database races
description: Shared database numbering can make otherwise passing invoice suites interfere across files
---

Run database-backed invoice integration files sequentially when verifying live-format invoice numbers or historical reconciliation.

**Why:** One suite reads the next invoice sequence while another suite issues invoices in the same database. Parallel files can then report a duplicate-number conflict and cascade into unrelated follow-on failures despite valid individual behavior.

**How to apply:** Use the test runner's no-file-parallelism option for combined invoice integration runs; this is not a reason to weaken production numbering or reconciliation safeguards.

An isolated database is not necessarily empty between serial suites. Immutable invoice fixtures can remain after ordinary source-order cleanup; never delete financial records merely to satisfy a global-empty-database assumption.

**Why:** A combined migration regression encountered retained invoice fixtures although its reconstructed order/audit tables were empty. Serialization prevented races but did not imply complete financial fixture removal.

**How to apply:** Prove the disposable database's identity, scope empty-table assertions to tables being reconstructed, and verify retained financial facts are unchanged across an upgrade.