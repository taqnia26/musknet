---
name: Invoice print verification
description: Browser print-media and modal-positioning pitfalls when checking invoice pagination
---

For Playwright PDF checks, explicitly emulate `print` immediately before generating a PDF if the page was previously set to `screen`. Confirm pagination and visible content in the resulting PDF, not just the screen layout with print CSS.

**Why:** A PDF captured after explicitly restoring screen media rendered as a single clipped page despite passing print-mode geometry checks. Also, modern CSS `translate` is independent of `transform`: resetting only `transform` leaves centered portal dialogs displaced on paper.

**How to apply:** When checking printable modal documents, inspect actual A4 PDF pages and neutralize both translation and transform on the modal's print layout; isolate the document from the rest of the page.