---
name: Catalog settings boundary
description: Why product-admin metadata must not silently change order calculations or fulfillment.
---

Product-admin settings introduced to capture an external catalog reference should remain saved product metadata until their behavior is deliberately integrated into the customer journey. In particular, a stored discount, taxability choice, shipping requirement, customer quantity limit, or attachment/note option must not be advertised as affecting live checkout merely because its field can be edited.

**Why:** Pricing and tax are also used by cart, quote, order, invoice, and accounting flows. Changing just one display or API response can charge a different amount than checkout records, while activating an attachment switch without an upload path misleads customers.

**How to apply:** When asked to make one of these settings operational, design and verify the full server-side calculation or order-input path, public UI, and persisted invoice/order consequences together. Until then, label the setting as saved-only in the admin UI.