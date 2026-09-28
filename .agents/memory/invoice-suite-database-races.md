---
name: Invoice suite database races
description: Shared database numbering can make otherwise passing invoice suites interfere across files
---

Run database-backed invoice integration files sequentially when verifying live-format invoice numbers or historical reconciliation.

**Why:** One suite reads the next invoice sequence while another suite issues invoices in the same database. Parallel files can then report a duplicate-number conflict and cascade into unrelated follow-on failures despite valid individual behavior.

**How to apply:** Use the test runner's no-file-parallelism option for combined invoice integration runs; this is not a reason to weaken production numbering or reconciliation safeguards.