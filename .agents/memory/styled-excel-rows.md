---
name: Styled Excel rows
description: How to interpret spreadsheet row counts when formatting extends beyond stored values.
---

Treat a worksheet's declared row range as positions to inspect, not proof that every row contains data. Count populated rows from actual cell values and report unique business keys separately.

**Why:** Excel files can serialize styled empty cells across a large range. A reader may correctly scan the whole range while finding only a small number of populated records, which can look like an artificial row limit unless the counts are separated.

**How to apply:** For spreadsheet imports, report at least the scanned row positions, populated rows, styled/blank rows, and unique identifiers. Add a fixture with values beyond early rows to prove the parser has no hidden cap.