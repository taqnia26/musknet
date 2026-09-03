---
name: Styled Excel rows
description: How to interpret spreadsheet row counts when formatting extends beyond stored values.
---

Treat a worksheet's declared row range as positions to inspect, not proof that every row contains data. Count populated rows from actual cell values and report unique business keys separately. Formula cells whose cached result is an Excel error such as `#N/A` should be unwrapped and treated as empty when the row has no source identifiers or amounts.

**Why:** Excel files can serialize styled empty cells across a large range. They can also leave VLOOKUP templates whose cached result is an error object rather than a primitive value. Either case can make a reader report phantom records unless values are normalized before deciding whether a row is populated.

**How to apply:** For spreadsheet imports, normalize formula results before testing row emptiness; report scanned positions, populated rows, styled/blank rows, and unique identifiers. Add fixtures for values beyond early rows and error-result formulas.