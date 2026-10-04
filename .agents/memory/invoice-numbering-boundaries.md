---
name: Invoice numbering boundaries
description: Owner's prefix request and non-negotiable preservation and approval boundaries
---
The owner requests M for new individual invoices and ML for new company/distributor invoices, retaining the separator, padding and sequence behavior unless a concrete reason is reported. Issued invoice numbers and original invoice numbers, historical and reconciled invoices, must never be rewritten. Order numbers are out of scope. Exhibition prefixes have not been specified and must remain unchanged.

**Why:** The owner's supplied numbering brief explicitly separates new issuance from existing financial records and leaves the choice of shared versus independent counters to the owner and accountant.

**How to apply:** Report the existing behavior and both counter options before implementation. Do not infer approval from a request to continue preparing the report. No schema change, migration, schema push or production access for this change before the owner approves the plan. Never weaken uniqueness or accounting-integrity protections. If introducing prefix checks, match the complete prefix and separator, not a bare M that would also match ML.