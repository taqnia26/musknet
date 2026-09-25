---
name: Order status publish gate
description: Why order-status data conversion and schema tightening require coordinated production release sequencing.
---

The development database migration is not equivalent to a production data migration. Before publishing a constrained order-status vocabulary against existing production records, inventory the production values and coordinate a compatible release sequence that converts historical values before enforcing the constraint. Do not run schema mutations from application startup or deploy builds.

**Why:** Replit's managed publish flow applies schema differences, not development data changes or one-off development migration scripts. A new status constraint can reject existing production orders even when development checks pass.

**How to apply:** Any future status vocabulary change that remaps stored order data needs an explicit production-release gate and a safe migration path; do not assume a successful development schema push makes production ready.