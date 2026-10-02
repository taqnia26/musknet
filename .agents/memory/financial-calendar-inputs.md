---
name: Financial calendar inputs
description: Generated date coercion can normalize invalid calendar days before financial validation.
---

Validate financial date-only request fields as raw ISO calendar strings, including a calendar round-trip check, before converting them to a Date.

**Why:** The generated validator for OpenAPI `format: date` uses date coercion. An impossible day such as `2026-02-30` can become March 2 before the service sees it, bypassing validation of the originally entered day.

**How to apply:** For new date-only financial request fields, use a plain string with an ISO-date pattern and validate the actual calendar day in the service. Keep date-time/response handling separate; do not replace unrelated date schemas without checking their callers.