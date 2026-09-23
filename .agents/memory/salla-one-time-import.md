---
name: Salla one-time import
description: Desired ownership and lifecycle of Salla-sourced store data.
---

The merchant wants to pull Salla products and orders into the application's database and then disconnect from Salla. Imported catalog and order history must remain usable without an active Salla connection.

**Why:** The merchant explicitly requested direct synchronization followed by disconnection rather than permanent runtime dependence on Salla.

**How to apply:** Design import with safe idempotent external IDs and a clear cutover; do not assume the screenshots contain importable data. Preserve image assets and mapping needed after disconnect. Ask for authorized Salla API access through secure flows, not chat.