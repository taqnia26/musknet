---
name: Historical shipping scope
description: How to classify shipments created before domestic/international scope was stored.
---

Shipments created before geographic scope existed default to `domestic`. Do not infer international status from free-text city, address, carrier, or service method. Correct known historical exceptions explicitly through shipment editing or a reviewed backfill.

**Why:** Legacy records have no reliable country field. Guessing from text would silently distort domestic and international shipping costs.

**How to apply:** Any report, migration, or import that groups shipping by scope must trust the stored classification. New shipments require an explicit domestic/international choice, and historical exceptions need deliberate correction.