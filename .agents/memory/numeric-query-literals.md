---
name: Numeric query literals
description: Handling generated Zod schemas that use numeric literal unions for URL query parameters.
---

Normalize numeric URL query parameters before validating them with generated Zod literal unions.

**Why:** Express exposes query values as strings, while the generated schema expects numeric literals such as `7 | 30 | 90`; valid URLs otherwise fail validation with a 400 response.

**How to apply:** When an OpenAPI query parameter generates a numeric literal union, convert the raw scalar query value to a number before passing it to the generated parser, while leaving invalid values for schema validation to reject.