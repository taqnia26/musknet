---
name: Shopper phone identity
description: Tradeoff when normalizing phone numbers across administrative customer creation and shopper OTP login.
---

Do not globally normalize phone numbers in shopper OTP flows as a small incidental change. Plan a migration and collision policy for historical customer and OTP records first.

**Why:** OTP login has historically identified users by the exact phone text submitted. Normalizing existing formatted numbers on login without reconciling historical rows can create a second account or change which account receives the session. An administrative creation flow can store canonical digit-only numbers, but that alone does not unify all historical shopper identities.

**How to apply:** When adding phone-based flows, distinguish preventing new duplicates from migrating old login identities. Preserve the existing login behavior until the old rows are inventoried and an explicit migration strategy is approved.