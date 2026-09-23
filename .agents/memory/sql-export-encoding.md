---
name: SQL export encoding
description: Reliable decoding of large single-cell base64 exports returned by the database callback
---

When exporting structured query results as base64 through the database callback, strip the column header, surrounding CSV quotes, and line breaks before decoding. Do not assume the returned text after the header is a raw uninterrupted base64 string.

**Why:** A large single-cell result arrived with outer quotes and wrapped lines; decoding it directly failed even though the SQL query succeeded.

**How to apply:** For read-only structured exports that must be written to a file, normalize the returned cell, decode it, then validate counts and identifiers before saving or presenting the backup.